import { createNanoEvents } from 'nanoevents';

class TrackedSettings {
	constructor(initial = {}, settingsDefinition = {}) {
		
		this._emitter = createNanoEvents();
		this._definition = settingsDefinition;

		let defaultSettings = {};
		for (const key in settingsDefinition) {
			if (settingsDefinition.hasOwnProperty(key)) {
				const setting = settingsDefinition[key];
				defaultSettings[key] = setting.default;
			}
		}
		this._values = { ...defaultSettings, ...initial };

		return new Proxy(this, {
			get(target, prop) {
				if (prop in target) return target[prop];
				return target._values[prop];
			},
			set(target, prop, value) {
				const oldValue = target._values[prop];
				if (oldValue !== value) {
					target._values[prop] = value;
					target._emitter.emit(prop, value);
					target._emitter.emit("change", { key: prop, value, oldValue });
				}
				return true;
			},
			has(target, prop) {
				return prop in target._values || prop in target;
			},
			ownKeys(target) {
				// Only enumerate _values props, not internal methods
				return Reflect.ownKeys(target._values);
			},
			getOwnPropertyDescriptor(target, prop) {
				if (prop in target._values) {
					return {
						configurable: true,
						enumerable: true,
						writable: true,
						value: target._values[prop]
					};
				}
				// Allow Object.keys and others to still find internal props
				return Reflect.getOwnPropertyDescriptor(target, prop);
			}
		});
	}

	getAll() {
		return { ...this._values };
	}

	setAll(newValues) {
		for (let key in newValues) {
			this[key] = newValues[key]; // triggers proxy
		}
	}

	get(key) {
		return this._values[key];
	}

	set(key, value) {
		this[key] = value; // Triggers proxy + event
	}
	

	on(event, handler) {
		return this._emitter.on(event, handler); // Returns unsubscribe()
	}

	off(event, handler) {
		// Not native to nanoevents, but you can filter manually if needed
		// or recreate emitter without that handler
	}

	definition () {
		return this._definition;
	}
}

export default TrackedSettings;
export { TrackedSettings };