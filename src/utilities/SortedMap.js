
import {default as AVLTree} from "avl";


export class SortedValueMap {

	constructor(ascending = true) {

		this.map = new Map();
		this.ascending = ascending;


		if (this.ascending) {
			this.tree = new AVLTree((a, b) => {
				if (a.key === b.key) {
					return 0;
				}
				if (a.value === b.value) {
					return a.key < b.key ? -1 : 1;
				}
				return a.value - b.value;
			});
		}else{
			this.tree = new AVLTree((a, b) => {
				if (a.key === b.key) {
					return 0;
				}
				if (a.value === b.value) {
					return a.key < b.key ? -1 : 1;
				}
				return b.value - a.value;
			});
		}
	}


	set(key, value) {
		if (this.map.has(key)) {
			const oldValue = this.map.get(key);
			this.tree.remove({ key, value: oldValue });
		}
		this.map.set(key, value);
		this.tree.insert({ key, value });
	}


	delete(key) {
		if(this.map.has(key)){
			const value = this.map.get(key);
			this.map.delete(key);
			this.tree.remove({ key, value });
		}
	}


	get(key) {
		return this.map.get(key);
	}


	getSortedKeys() {
		return this.tree.keys().map(node => node.key);
	}

	getSortedPairs() {
		return this.tree.keys().map(node => [node.key, node.value]);
	}
}

