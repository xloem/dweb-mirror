const stream = require('readable-stream');
const ParallelStream = require('./ParallelStream');

class _MirrorDebugStream extends ParallelStream {

    constructor(cb, options={}) {
        /* cb is function to turn item into something console.log can handle */
        options.highWaterMark = options.highWaterMark || 99999; // Dont let this debugging cause backpressure itself
        options.objectMode = true;
        options.name = options.name || "log";
        super(options);
        this.logfunction = cb;
    }
    // noinspection JSUnusedGlobalSymbols
    _parallel(data, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            console.log(...this.logfunction(data));
        } catch(err) {
            cb(err);
            return;
        }
        cb(null, data);
    }
}

class _MirrorEndStream extends ParallelStream {

    constructor(cbstart, cbperitem, cbfinal, options={}) {
        /* cb is function to turn item into something console.log can handle */
        options.highWaterMark = options.highWaterMark || 99999; // Dont let this debugging cause backpressure itself
        options.objectMode = true;
        options.name = options.name || "Endstream";
        super(options);
        this.cbperitem = cbperitem;
        this.cbfinal = cbfinal;
        if (cbstart) cbstart(this);
    }
    // noinspection JSUnusedGlobalSymbols
    _parallel(data, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            if (this.cbperitem) { this.cbperitem(data, this); } // Note doesnt push
        } catch(err) {
            cb(err);
            return;
        }
        cb(); // Note no data sent on
    }
    _final(cb) {
        if (this.parallel.limit) {
            console.log(this.name, "Probably Shouldnt be running an End stream in parallel")
            if (this.parallel.count) {
                console.log("EndStream: Waiting on", this.parallel.count, "of max", this.parallel.max, "threads to close");
                setTimeout(() => this._final(cb), 1000);
                return;
            }
            //console.log(this.name, "_final Closing parallel. Was max=", this.parallel.max);
        } else {
            //console.log(this.name, "_final Closing");
        }
        // OK cleared any parallel stuff that shouldnt be there!
        if (this.cbfinal) {
            this.cbfinal(this)
        }
        cb();
    }

}
class _MirrorMapStream extends ParallelStream {
    /*
    input stream - any objects
    output stream - transformed depending
     */
    constructor(cb, options={}) {
        super(options);
        this.mapfunction = cb;
    }

    _parallel(o, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            // cb(null, this.mapfunction(o));   //TODO automate detection of promise
            let p = this.mapfunction(o);
            if (p instanceof Promise) {
                p.then((data) => cb(null, data))
                    .catch((err) => cb(err));
            } else {
                cb(null, p);
            }
        } catch(err) {
            console.log("_MirrorMapStream._parallel caught error", err.message);
            cb(err);
        }
    }
}

class _MirrorSplitStream extends ParallelStream {
    /*
    input stream - of arrays
    output stream - expand arrays into a single stream
     */
    _parallel(oo, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            if (Array.isArray(oo)) {
                oo.forEach(o => this.push(o));
            } else if ((typeof oo) !== "undefined") {
                this.push(oo);
            }
            cb();
        } catch(err) {
            cb(err);
        }
    }
}
class _MirrorSliceStream extends ParallelStream {
    /*
    input stream - of objects (or anything really)
    output stream - equivalent of .splice
     */


    constructor(begin=0, end=undefined, options={}) {
        super(options);
        this.beginx = begin;
        this.endx = end; // Not included, undefined to continue
        this.count = 0; // How many already processed
    }

    _parallel(o, encoding, cb) {
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            if ((this.beginx <= this.count) && ((typeof this.endx  === "undefined")|| this.count < this.endx)) {
                this.push(o);
            }
            this.count++; //Note count is how many processed, not how many pushed
            cb();
        } catch(err) {
            cb(err);
        }
    }
}

class _MirrorFilterStream extends ParallelStream {
    /*
    input stream
    output stream filtered by cb
     */
    constructor(cb, options={}) {
        super(options); // None currently
        this.cb = cb;
    }


    _parallel(o, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            if (this.cb(o)) {
                this.push(o);   // Only push if matches filter
            }
            cb();
        } catch(err) {
            cb(err);
        }
    }
}
class _MirrorUniqStream extends ParallelStream {
    /*
    input stream
    output stream with non uniq ids removed
     */
    constructor(cb, options={}) {
        options.name = options.name || "uniq";
        super(options); // None currently
        this.uniq = Array.isArray(options.uniq) ? options.uniq : [] ; // Can pass an existing array, which will be filtered out
        this.uniqid = (typeof cb === "function" ? cb : function(a){return a} );
    }

    _parallel(o, encoding, cb) {    // A search result got written to this stream
        if (typeof encoding === 'function') { cb = encoding; encoding = null; } // Allow missing encoding
        try {
            let id = this.uniqid(o);
            if (! this.uniq.includes(id) ) {
                //console.log("Not Duplicate with id=", id);
                this.uniq.push(id);
                this.push(o);   // Only push if uniq
            } else {
                console.log("Duplicate with id=", id);
            }
            cb();
        } catch(err) {
            cb(err);
        }
    }
}


class s {
    constructor(options={}) {
        this.options=options;
    }
    map(cb) {
        return new _MirrorMapStream(cb, this.options);
    }
    split() {
        // TODO could add options as to whether should handle single objs as well as arrays and whether to ignore undefined
        return new _MirrorSplitStream(this.options);
    }
    slice(begin, end) {
        return new _MirrorSliceStream(begin, end, this.options);
    }
    filter(cb) {
        return new _MirrorFilterStream(cb, this.options);
    }
    log(cb) {
        return new _MirrorDebugStream(cb, this.options);
    }
    uniq(cb) {
        return new _MirrorUniqStream(cb, this.options);
    }
    end(cbstart, cbperitem, cbfinal) {
        return new _MirrorEndStream(cbstart, cbperitem, cbfinal, this.options);
    }


    fromEdibleArray(ediblearr) {
        /*
            Consume array, feeding it to a new stream
         */
        // noinspection JSUnresolvedFunction
        let through = new stream.PassThrough({objectMode: true, highWaterMark: 3});
        let name = this.name || ""; // As this unavailable in _pushbackablewrite
        //Unused: let self = this; // this is unavailable in _pushbackablewrite
        try {
            _pushbackablewrite(); // Will .end stream when done
        } catch (err) {
            // Would be unexpected to see error here, more likely _p_crawl will catch it asynchronously
            console.error(err);
            through.destroy(new Error(`Failure in ${name}.s_fromEdibleArray: ${err.message}`))
        }
        console.log(name, "s_fromEdibleArray ending");
        return through;

        function _pushbackablewrite() { // Asynchronous, retriggerable
            // Note consumes eatable array from parent
            console.log(`Continuing ${name}`);
            try {
                let i;
                while (i = ediblearr.shift()) {
                    if (!through.write(i)) { // It still got written, but there is pushback
                        console.error(`Pushback at ${name}.${i} from stream=========================`);
                        through.once("drain", _pushbackablewrite);
                        return; // Without finishing
                    }
                } //while
                // Notice the return above will exit if sees backpressure
                through.end();    // Only end on final loop
            } catch(err) {
                console.error(err);
                through.destroy(new Error(`Failure in ${name}._pushbackablewrite: ${err.message}`))
            }
        }
    }
}

// usage .pipe(new s(options).map(cb))
exports = module.exports = s;