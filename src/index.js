const FS = require("fs");
const PATH = require("path");

const WSS = require("../../../website-security-scanner/src/main.js");

const PATHS = {
    BANKS: "../banks/",
    HTML: "../html/",
    HISTORY: "../history/",
    OUTPUT: "../docs/",
    RESOURCES: "../resources/",
    IMAGES: "../images/"
};

var banks = [];


for (filename of ["ie.json"]) {//FS.readdirSync(PATH.resolve(__dirname, PATHS.BANKS))) {

    let file;
    file = FS.readFileSync(PATH.resolve(__dirname, PATHS.BANKS, filename), "utf8");
    file = JSON.parse(file);

    // Sanity check, ensure filename matches file contents
    if (filename !== (file.code + ".json")) {
        throw Error("Filename does not match contents - " + filename);
    }

    for (bankObject of file.list) {

        bankObject.country = file.code;
        banks.push(bankObject);

    }

}


// Sort into alphabetical order
banks.sort((a, b) => {
    if (a.name > b.name) {
        return 1;
    } else if (a.name < b.name) {
        return -1;
    }

    if (a.country > b.country) {
        return -1;
    }

    return 1;
});


var index = 0;

async function begin() {

    return new Promise((resolve, reject) => {

        let bank = banks[index];
        index += 1;

        let scanner = new WSS(bank.domain);

        scanner.scan()
        .then((results) => {

            banks[index - 1].results = results;

            if (banks.length > index) { // call recursively

                setTimeout(() => {
                    begin()
                    .then(() => {
                        resolve();
                    });
                }, 5000);

            } else { // last element
                resolve();
            }

        });

    });

}

begin()
.then(createWebsite);


var countries = {};

function createWebsite() {

    for (bank of banks) {

        if (undefined === countries[bank.country]) {
            countries[bank.country] = [];
        }
        countries[bank.country].push(bank);

        let results = processResults(bank.results);

    }

}


function processResults(results) {

    let response = {};

    response.HTTPS = {
        "Upgrade HTTP": results.upgradeHttp.result,
        "Secure Redirection": results.secureRedirectionChain.result,
        "HSTS": results.hsts.result,
        "HSTS Preload": false
    };

    if (response.HTTPS.HSTS) {
        response.HTTPS["HSTS Preload"] = results.hsts.data.preloaded
    }

    response.TLS = {
        "TLS 1.3 Enabled": results.tlsProtocols.data["1.3"],
        "Old TLS Disabled": !(results.tlsProtocols.data["1.1"] || results.tlsProtocols.data["1.0"]),
        "Forward Secrecy": results.forwardSecrecy.result
    };

    response.DNS = {
        "DNSSEC": results.dnssec.result,
        "CAA": results.caa.result
    };

    return response;

}
