// Careful not to introduce too many dependencies in here, as called very early in applications
const os = require('os');
const fs = require('fs');   // See https://nodejs.org/api/fs.html
const path = require('path');
const glob = require('glob');
const debug = require('debug')('dweb-mirror:MirrorConfig');
const asyncMap = require('async/map');
//const canonicaljson = require('@stratumn/canonicaljson');
const yaml = require('js-yaml');
// noinspection JSUnusedLocalSymbols
const ACUtil = require('@internetarchive/dweb-archivecontroller/Util.js'); //for Object.deeperAssign

const defaultConfigFiles = [ "./configDefaults.yaml", "~/dweb-mirror.config.yaml"]; // config files (later override earlier)

class MirrorConfig {
    /*
    A set of tools to manage and work on configuration data structures and to map to storage or UI

    Note the API for this is in flux as build the first few use cases
    */
    constructor(...objs) {
        this.setOpts(...objs);
    }

    static new(filenames, cb) { //TODO-API
        /* build a new MirrorConfig from a set of options loaded from YAML files,
            filename: filename of file, may use ., .., ~ etc, parameters in later override those in earlier.
        */
        if (typeof filenames === "function") { cb = filenames; filenames = undefined}
        if (!(filenames && filenames.length)) { filenames = defaultConfigFiles; }
        asyncMap(this.resolves(filenames),
            (filename, cb2) => {
                this.readYaml(filename, (err, res) => cb2(null, res)); // Ignore err, and res should be {} if error
            },
            (err, configobjs) => { // [ {...}* ]
                if (err) { cb(err, null); } else {
                    const config =  new MirrorConfig(...configobjs);
                    // noinspection JSUnresolvedVariable
                    debug("config summary: directory:%o archiveui:%s", config.directories, config.archiveui.directory);
                    cb(null, config);
                }
            })
    }

    static resolve(v) { // Handle ~ or . or .. in a path
        // noinspection JSUnresolvedVariable
        return (v.startsWith("~/") ? path.resolve(os.homedir(), v.slice(2)) : path.resolve(process.cwd(), v)); }

    static resolves(vv) {
        return [].concat(...  // flatten result
            vv.map(v => this.resolve(v))    // Handle ~ or . or ..
                .map(p => glob.sync(p)));           // And expand * etc (to an array of arrays)
    }
    static firstExisting(arr) {
            // Find the first of arr that exists, args can be relative to the process directory .../dweb-mirror
            // returns undefined if none found
            // noinspection JSUnresolvedVariable
            return this.resolves(arr).find(p=>fs.existsSync(p));
    }

    setOpts(...opts) {
        Object.deeperAssign(this, ...opts);
        this.directories = MirrorConfig.resolves(this.directories); // Handle ~/ ./ ../ and expand * or ?? etc
        // noinspection JSUnresolvedVariable
        this.archiveui.directory = MirrorConfig.firstExisting(this.archiveui.directories); // Handle ~/ ./ ../ * ?? and find first match
    }

    // noinspection JSUnusedGlobalSymbols
    static readYamlSync(filename) {
        try {
            return yaml.safeLoad(fs.readFileSync(MirrorConfig.resolve(filename), 'utf8'));
        } catch(err) {
            debug("Error reading user configuration: %s", err.message);
            return {};    // Caller is free to ignore err and treat {} as an empty set of config params
        }
    }
    static readYaml(filename, cb) {
        fs.readFile(filename, 'utf8', (err, yamlstr) => {
            if (err) {
                debug("Unable to read %s: %s", filename, err.message);
                cb (err, {});
            } else {
                try {
                    const o = yaml.safeLoad(yamlstr);
                    try { cb(null, o); } catch(err) { console.error("Uncaught err in readYaml cb ", err); }
                } catch(err) {
                    debug("Unable to pass yaml: %s", err.message);
                    cb(err, {});
                }
            }
        })
    }

}
exports = module.exports = MirrorConfig;
