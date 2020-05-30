document.getElementById("bar").classList.remove("hide");

function search() {

	let term = document.getElementById("bar").value.toLowerCase();
	let list = document.getElementsByClassName("card");

	for (i=0; i<list.length; i++) {

		let item = list[i];
		let found = false;

		let text = [];
		let children = item.children;

		for (j=1; j<4; j++) {
			text.push(children[j]);
		}

		for (j=0; j<text.length; j++) {

			let test = text[j].innerText.toLowerCase();

			if (test.includes(term)) {
				found = true;
			}
		}

		if (found) {
			item.classList.remove("hide");
		} else {
			item.classList.add("hide");
		}

	}

}

document.getElementById("bar").addEventListener("keyup", search);
