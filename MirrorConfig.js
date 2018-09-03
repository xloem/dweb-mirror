const ArchiveFile  = require("@internetarchive/dweb-archive/ArchiveFile");
const ArchiveItem  = require("@internetarchive/dweb-archive/ArchiveItem");

class MirrorConfig {
    /*
    A set of tools to manage and work on configuration data structures and to map to storage or UI

    Note the API for this is in flux as build the first few use cases

    Fields
    config: {
        // Miscellaneous used in mirroring - may be changed to a canonical version
            directory: "/Users/mitra/temp/mirrored",
            limittotalfiles: 250,
        file: { // Configuration (especially filtering) relating to any file
            maxfilesize: 1000000,
        }
        item: {
            minimumForUi: true, // Select a minimum set of files that are required to play the item in the Archive UI
        }
        search: {
            itemsperpage: // Optimum is probably around 100
            pagespersearch: // Number of pages to search, so total max results is pagespersearch * itemsperpage
        }
        collections: { // Specific parameters relating to each collection, also used as a list of collections to operate on
            <collectionid>: {},
        }
    }
    */
    constructor(init) {
        Object.keys(init).forEach(f => { this[f] = init[f]; delete init[f] }) // Copy each of init.xx to this.xx
    }
    filterlist(o) {
        if (o instanceof ArchiveItem) {
            if (this.item["minimumForUi"]) {
                if (!o.playlist) o.setPlaylist();
                //TODO-ISSUE#33 need to add other required files for the UI to this, probably in the ArchiveItem class
                return Object.values(o.playlist).map(v => v.sources[0].urls); // First source from each (urls is a single ArchiveFile in this case)
            } else {
                return o._list;
            }
        } else {
            console.error("Invalid type to MirrorConfig.filterlist", o);
            return []; // Undefined response
        }
    }
    filter(o) {
        if ((o instanceof ArchiveFile) && (
            (this.file.maxfilesize && this.file.maxfilesize < o.metadata.size)
        )) return false;
        return true;
    }
}
exports = module.exports = MirrorConfig;
