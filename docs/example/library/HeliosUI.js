//class HeliosUI

import { Pane } from "tweakpane";
import * as d3Chromatic from "d3-scale-chromatic"
import { default as extraColors } from "./extraColors"
document.documentElement.style.setProperty('--tp-base-border-radius', '0px');


let allColors = {}
Object.assign(allColors, d3Chromatic);
Object.assign(allColors, extraColors);

// console.log(allColors);
//remove last color of category10
// allColors["schemeCategory10"].pop();

//sort colors by name
allColors = Object.keys(allColors).sort().reduce((r, k) => (r[k] = allColors[k], r), {});

// allColors["interpolateRedBlackBlue"] = d3ScaleLinear().domain([0,0.5,1.0]).range(["red","black", "blue"])
let ignoredProperties = new Set(["ID", "edges", "neighbors"]);


function patchPaneNumberInputWithCustomParser(pane, type="inputs", name="input-number") {
	let inp_number = pane.pool_.pluginsMap_[type].find(inp => inp.id == name);

	const { controller } = inp_number;

	inp_number.controller = (_args) => {
		let c = controller(_args);
		if (c.textController && _args.params.format?.parser) {
			const parser = c.textController.parser_;
			c.textController.parser_ = (value) => _args.params.format.parser(parser(value));
		}
		return c;
	};

	//// uncomment to get transformed values in PARAMS
	const { reader, writer } = inp_number.binding;
	inp_number.binding.reader = _args => _args.params.format?.reader ? _args.params.format?.reader : reader(_args);
	inp_number.binding.writer = _args => _args.params.format?.writer ? _args.params.format?.writer : writer(_args);
}

// utility fn for exponential format
const toExp = (value)=> (""+(+value.toExponential(1)).toExponential(1).replace('+',''))

const exp_formatter = (value) => toExp(10 ** value);
exp_formatter.parser = (value) => Math.log10(value);
exp_formatter.reader =  (value) => Math.log10(value);
exp_formatter.writer =  (target, value) => target.write(10**value);




export default class HeliosUI {
	constructor(helios, options = { collapsed: false, resizeHelios: false }) {
		// weak reference to helios
		this._helios = helios;
		this._isCollapsed = options?.collapsed;
		this._resizeHelios = options?.resizeHelios;
		this._createContainerPanel();
	}

	_createContainerPanel() {
		this.panelContainer = document.createElement('div');
		this.panelContainer.style.setProperty('--tp-base-font-family', 'Helvetica');
		this.panelContainer.style.width = '250px';
		this.panelContainer.style.height = '100%';
		this.panelContainer.style.position = 'absolute';
		this.panelContainer.style.top = '0';
		this.panelContainer.style.pointerEvents = 'auto';
		this.panelContainer.style.backgroundColor = 'rgba(75,75,75,0.2)';
		this.panelContainer.style.overflow = 'visible';
		this.panelContainer.style.transition = 'right 0.3s ease';
		this._helios.overlay.appendChild(this.panelContainer);

		this.panel = document.createElement('div');
		this.panel.style.width = '100%';
		this.panel.style.height = '100%';
		this.panel.style.position = 'relative';
		//allow visible elements outside of div
		this.panel.style.overflow = 'visible';

		this.panelContainer.appendChild(this.panel);

		this.toggleButton = document.createElement('div');
		this.toggleButton.style.position = 'absolute';
		this.toggleButton.style.top = '0px';
		this.toggleButton.style.fontSize = "12px"
		this.toggleButton.style.left = '-25px';
		this.toggleButton.style.width = '25px';
		this.toggleButton.style.height = '70px';
		// bold
		this.toggleButton.style.fontWeight = 'bold';
		this.toggleButton.style.backgroundColor = 'rgba(75, 75, 75, 0.45)';
		this.toggleButton.style.color = 'white';
		this.toggleButton.style.textAlign = 'center';
		// this.toggleButton.style.lineHeight = '100px';
		this.toggleButton.style.lineHeight = '25px';
		this.toggleButton.style.cursor = 'pointer';
		// writing-mode: vertical-rl;
		this.toggleButton.style.writingMode = 'vertical-rl';
		if (this._isCollapsed) {
			this.toggleButton.textContent = 'Controls';
			this.panelContainer.style.right = '-255px';
		} else {
			this.toggleButton.textContent = 'Controls';
			this.panelContainer.style.right = '0px';
		}
		if (this._resizeHelios) {
			// enable animations in css
			this._helios.canvasElement.style.transition = 'padding-right 0.3s ease';
			console.log(this.panelContainer.style.right)
			this._helios.canvasElement.style.paddingRight = this._isCollapsed ? "0px" : "250px";
			this._helios.svgLayer.style.paddingRight = this._isCollapsed ? "0px" : "250px";
		}
		this.panel.appendChild(this.toggleButton);

		this.toggleButton.addEventListener('click', () => {
			this.toggleCollapse();
		});

		this.pane = new Pane({
			container: this.panel,
			// title: 'Helios',
		});
		patchPaneNumberInputWithCustomParser(this.pane, "inputs", "input-number");
		patchPaneNumberInputWithCustomParser(this.pane, "monitors", "monitor-number");
		
		this.settings = {
			// Helios Visuals
			shaded: false,
			advancedEdges: false,
			darkMode: false,
			blendings: "normal", // Only for darkMode

			// Nodes
			nodeSizeScale: 1.0,

			// Nodes Colors
			nodeColorProperty: "index",
			nodeColorMap: "viridis",
			nodeOutlineScale: 1.0,

			// Edges
			edgeOpacityScale: 0.1,

			// Density
			densityEnabled: false,
			densityProperty: "uniform",
			densityVsProperty: "None",
			densityBandwidth: 0.1,
			densityWeight: 0.5,

			// Layout
			layout: "Multipole FR",
			gravity: 0.1,
			forcesIntensity: 0.1,
			attractiveRepulsiveRatio: 1.0,

			// Filter Nodes
			filterNodes: false,
			filterNodesProperty: "None",
			filterNodesInterval: [0, 1],

			// Filter Edges
			filterEdges: false,
			filterEdgesProperty: "None",
			filterEdgesInterval: [0, 1],



		};
		this.addHeliosPropertiesPane();
		this.addHeliosLayoutPanel();
	}

	updateFromHelios() {
		// // Helios Visuals
		// shaded: false,
		// advancedEdges: false,
		// darkMode: false,
		// blendings: "normal", // Only for darkMode
		this.settings.shaded = helios.shadedNodes();
		this.settings.advancedEdges = helios._settings.fastEdges;
		// this.settings.darkMode = helios._settings.darkMode;
		this.settings.blendings = helios.additiveBlending() ? "additive" : "normal";

		// // Nodes
		// nodeSizeScale: 1.0,
		// nodeOutlineScale:1.0,
		this.settings.nodeSizeScale = helios.nodesGlobalSizeScale()
		this.settings.nodeOutlineScale = helios.nodesGlobalOutlineWidthScale()

		// // Nodes Colors
		// 	nodeColorProperty:"index",
		// 	nodeColorMap:"viridis",

		// // Edges
		// edgeOpacityScale: 0.1,
		this.settings.edgeOpacityScale = helios.edgesGlobalOpacityScale()

		// // Density
		this.settings.densityEnabled = helios.densityMap ? true : false;
		if (this.settings.densityEnabled) {
			this.densityBandwidth = helios.densityMap.bandwidthScale;
			this.densityWeight = helios.densityMap.kernel_weightScale;
		}
		// densityEnabled: false,
		// densityProperty:"uniform",
		// densityVsProperty: "None",
		// densityBandwidth: 0.1,
		// densityWeight: 0.5,

		// // Layout
		// layout: "Multipole FR",
		// gravity: 0.1,
		// forcesIntensity: 0.1,
		// attractiveRepulsiveRatio: 1.0,

		// // Filter Nodes
		// filterNodes: false,
		// filterNodesProperty: "None",
		// filterNodesInterval: [0, 1],

		// // Filter Edges
		// filterEdges: false,
		// filterEdgesProperty: "None",
		// filterEdgesInterval: [0, 1],


	}

	toggleCollapse() {
		if (!this._isCollapsed) {
			this.panelContainer.style.right = '-255px';
			this.toggleButton.textContent = "Controls"//'◀';
		} else {
			this.panelContainer.style.right = '0';
			this.toggleButton.textContent = "Controls"//'▶';
		}
		if (this._resizeHelios) {
			this._helios.canvasElement.style.paddingRight = this._isCollapsed ? "250px" : "0px";
			this._helios.svgLayer.style.paddingRight = this._isCollapsed ? "250px" : "0px";
		}
		this._isCollapsed = !this._isCollapsed;
	}

	isCollapsed() {
		return this._isCollapsed;
	}


	addHeliosPropertiesPane() {
		this.visualPropertiesPanel = this.pane.addFolder({
			title: 'Node Visuals',
			expanded: true,
		});

		this.visualPropertiesPanel.addBinding(this.settings, 'edgeOpacityScale', {
			min: 0,
			max: 255,
			step: 1,
			format: (v) => v / 255.0,
			label: 'Edge Opacity',
		}).on('change', (ev) => {
			this._helios.edgesGlobalOpacityScale(ev.value / 255.0);
			this._helios.render();
		});
	}

	addHeliosLayoutPanel() {
		let forceLayout = this._helios.layoutWorker;
		if (!forceLayout) {
			console.warn("No layout worker found, cannot add layout panel.");
			return;
		}
		this.layoutPanel = this.createSettingsPanel(
			this.pane,
			forceLayout,
			'Force Layout',
			true,
			()=>{
				forceLayout.interactionReheat();
			}

		);
	}

	createSettingsPanel(pane, instance, title, expanded = true, defaultAction) {
		let settings = instance.settings();

		let settingsDefinition = settings.definition();
		let folder = pane.addFolder({
			title: title,
			expanded: expanded,
		});

		Object.keys(settingsDefinition).forEach((key) => {
			let setting = settingsDefinition[key];
			let binding = null;
			if (setting.type === "boolean") {
				binding = folder.addBinding(settings, key, {
					label: setting.label,
					readonly: setting.access === "readonly",
				});
				if(setting.access !== "readonly") {
					binding.on('change', (ev) => {
						instance[key](ev.value);
						defaultAction?.(key, ev.value);
					});
				}
			} else if (setting.type === "number") {
				let bindingOptions = {
					label: setting.label,
					readonly: setting.access === "readonly",
				};
				if (setting.preferableRange) {
					bindingOptions.min = setting.preferableRange[0];
					bindingOptions.max = setting.preferableRange[1];
					bindingOptions.step = setting.preferableRange[2] || 0.01;
				}
				if (setting.transform === "log") {
					if(setting.preferableRange){
						bindingOptions.min = Math.log10(bindingOptions.min);
						bindingOptions.max = Math.log10(bindingOptions.max);
					}
					// bindingOptions.format = (v) => Math.pow(10, v);
					bindingOptions.format = exp_formatter;
					// initial value
					console.log(`Binding ${key} with log transform:`, bindingOptions);
				}
				binding = folder.addBinding(settings, key, bindingOptions)
				

				if(setting.access !== "readonly") {
					binding.on('change', (ev) => {
						// console.log(`Setting ${key} with log transform:`, ev.value);
						instance[key](ev.value);
						defaultAction?.(key, ev.value);
					});
				}
			} else if (setting.type === "categorical") {
				binding =  folder.addBinding(settings, key, {
					label: setting.label,
					options: setting.options,
					readOnly: setting.access === "readonly",
				}).on('change', (ev) => {
					instance[key](ev.value);
					defaultAction?.(key, ev.value);
				});
			}
			if (binding) {
				// console.log(`Binding created for ${key}:`, binding);
				settings.on(key, (value) => {
					binding.refresh();
				});
			}
		});
		// if (setting.enabled) {
		// 	folder.addBinding(this.layoutSettings, setting.enabled, {
		// 		label: "Enable " + setting.label,
		// 		readOnly: setting.access === "readonly",
		// 	}).on('change', (ev) => {
		// 		instance[setting.enabled](ev.value);
		// 	});
		// }
		return folder;
	}
}


// settings for d3ForceLayoutWorker
// const SETTINGS_DEFINITION = {
// 	use2D: {
// 		type: "boolean",
// 		default: false,
// 		label: "Use 2D",
// 		access: "readwrite",
// 		description: "Use 2D forces instead of 3D forces. This will ignore the z-coordinate of nodes and edges.",
// 		// default change function (instance.use2D(value))
// 	},
// 	forcesStrength: {
// 		type: "number",
// 		default: 1,
// 		label: "Forces Strength",
// 		access: "readwrite",
// 		preferableRange: [0.1, 10],
// 		transform: "log",
// 		description: "The strength of the forces applied to the nodes. Higher values will result in stronger forces.",
// 	},
// 	forcesRatio: {
// 		type: "number",
// 		default: 1,
// 		label: "Forces Ratio",
// 		access: "readwrite",
// 		preferableRange: [0.1, 10],
// 		transform: "log",
// 		description: "The ratio between attractive and repulsive forces. A value of 1 means equal strength, higher values mean stronger attractive forces.",
// 	},
// 	repulsiveExponent: {
// 		type: "number",
// 		default: 1,
// 		label: "Repulsive Exponent",
// 		access: "readwrite",
// 		preferableRange: [0.5, 2],
// 		transform: "log",
// 		description: "The exponent for the repulsive force. Higher values will result in stronger repulsive forces.",
// 	},
// 	attractiveExponent: {
// 		type: "number",
// 		default: 1,
// 		label: "Attractive Exponent",
// 		access: "readwrite",
// 		preferableRange: [0.5, 2],
// 		transform: "log",
// 		description: "The exponent for the attractive force. Higher values will result in stronger attractive forces.",
// 	},
// 	gravity: {
// 		type: "number",
// 		default: 0.05,
// 		label: "Gravity",
// 		access: "readwrite",
// 		preferableRange: [0.1, 10],
// 		transform: "log",
// 		description: "The strength of the gravity force applied to the nodes. Higher values will result in stronger gravity forces.",
// 	},
// 	viscosity: {
// 		type: "number",
// 		default: 0.05,
// 		label: "Viscosity",
// 		access: "readwrite",
// 		preferableRange: [0.1, 10],
// 		transform: "log",
// 		description: "The strength of the viscosity force applied to the nodes. Higher values will result in stronger viscosity forces.",
// 	},
// 	collisionRadius: {
// 		type: "number",
// 		default: 50,
// 		label: "Collision Radius",
// 		access: "readwrite",
// 		preferableRange: [1, 100],
// 		transform: "log",
// 		description: "The radius of the collision force applied to the nodes. Higher values will result in larger collision areas.",
// 		enabled: "collisionEnabled",
// 	},
// 	collisionEnabled: {
// 		type: "boolean",
// 		default: false,
// 		label: "Collision Force",
// 		access: "readwrite",
// 		description: "Enable or disable the collision force. When enabled, nodes will repel each other based on their collision radius.",
// 	},
// 	linkDistance: {
// 		type: "number",
// 		default: 30,
// 		label: "Link Distance",
// 		access: "readwrite",
// 		preferableRange: [0, 100],
// 		description: "The distance between linked nodes. Higher values will result in more spaced out nodes.",
// 	},
// 	forceNormalizationType: {
// 		type: "categorical",
// 		options: ["strength", "degree", "none"],
// 		default: "degree",
// 		label: "Normalization Type",
// 		access: "readwrite",
// 		description: "The type of normalization applied to the attractive force. 'strength' normalizes by the minimum strength of the linked nodes, 'degree' normalizes by the minimum degree of the linked nodes, and 'none' applies the force without normalization.",
// 	},
// 	alpha: {
// 		type: "number",
// 		default: 1.0,
// 		label: "Alpha",
// 		access: "readwrite",
// 		preferableRange: [0.001, 1],
// 		description: "The alpha value of the simulation. This controls the strength of the forces applied to the nodes. The value will decay over time, simulating a cooling effect.",
// 	},
// 	alphaDecay: {
// 		type: "number",
// 		default: 1 - Math.pow(0.001, 1 / 300),
// 		label: "Alpha Decay",
// 		access: "readwrite",
// 		preferableRange: [0.001, 1],
// 		transform: "log",
// 		description: "The decay rate of the alpha value. This controls how quickly the forces applied to the nodes will decrease over time. A value of 1 means no decay, while a value close to 0 means very fast decay.",
// 	},
// 	alphaTarget: {
// 		type: "number",
// 		default: 0,
// 		label: "Alpha Target",
// 		access: "readwrite",
// 		preferableRange: [0, 1],
// 		description: "The target alpha value of the simulation. This controls the final strength of the forces applied to the nodes. The alpha value will decay towards this target value over time.",
// 	},
// 	alphaMin: {
// 		type: "number",
// 		default: 0.001,
// 		label: "Alpha Min",
// 		access: "readwrite",
// 		preferableRange: [0.0001, 1],
// 		transform: "log",
// 		description: "The minimum alpha value of the simulation. This controls the minimum strength of the forces applied to the nodes. The alpha value will not decay below this value.",
// 	},
// 	running: {
// 		type: "boolean",
// 		default: false,
// 		label: "Running",
// 		access: "readonly",
// 		description: "Indicates whether the layout is currently running. This is set to true when the layout is started and false when it is stopped.",
// 	},
// };

