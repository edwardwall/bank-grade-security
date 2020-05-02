const FS = require("fs");

const PATHS = {
    HTML  : "../html/",
    OUTPUT: "../docs/"
};

const TEMPLATES = getTemplates();




/**
 * Function to read in and prepare HTML files.
 */
function getTemplates() {

    let filenames = FS.readdirSync(PATHS.HTML);

    let templates = {};

    for (filename of filenames) {

        let key = filename.substring(0, filename.indexOf('.'));
        templates[key] = FS.readFileSync(PATHS.HTML + filename, "utf8");

    }

    let ret = {};

    for (key in templates) {

        if (key.toLowerCase().includes("header") ||
            key.toLowerCase().includes("footer")) {

            continue;
        }

        if (key.startsWith("template")) {
            ret[key.toUpperCase()] = templates[key];
            continue;
        }

        templates[key] = templates[key]
            .replace("$header", templates.templateHeader)
            .replace("$footer", templates.templateFooter);

        ret[key.toUpperCase()] = templates[key];

    }

    return ret;

}
