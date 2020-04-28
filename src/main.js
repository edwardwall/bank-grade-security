const FS = require("fs");

var countries = {};
var banks = [];
var results = {};

var interval;

const banksFile = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

// Read banks from file
for (countryObject of banksFile) {

    let countryCode = countryObject.code.toLowerCase();
    countries[countryCode] = countryObject.name;

    for (bankObject of countryObject.list) {

        bankObject.country = countryCode;
        banks.push(bankObject);

    }

}

banks = banks.sort((a, b) => {
    return a < b;
})

interval = setInterval(begin, 1000); // 1 second

/**
 * Function to begin testing of the next bank
 */
async function begin() {

    let bankObject = banks.splice(0, 1)[0];

    // check if this was final element in list
    if (0 == banks.length) {
        clearInterval(interval);
    }

    let data = {
        county: bankObject.country,
        name: bankObject.name
    }

}
