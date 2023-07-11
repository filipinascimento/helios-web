/**
 * A class representing a behavior filter for Helios.
 */
export class BehaviorFilter {
	/**
	 * Creates a new instance of BehaviorFilter.
	 * @param {Helios} helios - The Helios object to be attached to.
	 */
	constructor(helios) {
		/**
		 * The filters to be applied.
		 * @type {Object}
		 * @private
		 */
		this._filters = {};
		this._updatedNodes = new Set();

		/**
		 * The Helios object to be attached to.
		 * @type {Helios}
		 * @private
		 */
		this._helios = helios;
	}

	/**
	 * Gets the filters.
	 * @type {Object}
	 */
	get filters() {
		return this._filters;
	}

	/**
	 * Sets a filter.
	 * @param {string} name - The name of the filter.
	 * @param {function} filter - The filter function.
	 */
	setFilter(name, filter) {
		this._filters[name] = filter;
	}

	/**
	 * Removes a filter.
	 * @param {string} name - The name of the filter to remove.
	 */
	removeFilter(name) {
		delete this._filters[name];
	}

	/**
	 * Applies the filters.
	 */
	applyFilters() {
		for (let node of this._helios.network.index2Node) {
			let nodeState = false;
			for (let filter in this._filters) {
				nodeState = nodeState || this._filters[filter](node);
			}
			if (nodeState != node._filtered) {
				this._updatedNodes.add(node);
			}
			node._filtered = nodeState;
		}
	}

	/**
	 * Gets the updated nodes.
	 * @type {Set}
	 * @readonly
	 */
	updatedNodes(clear=true) {
		//Create copy of set
		let nodes = new Set(this._updatedNodes);
		if (clear) {
			this._updatedNodes.clear();
		}
		return nodes;
	} 
}
