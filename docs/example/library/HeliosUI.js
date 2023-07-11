//class HeliosUI

import { Pane } from "tweakpane";
document.documentElement.style.setProperty('--tp-base-border-radius', '0px');

export default class HeliosUI {
	constructor(helios,options={collapsed:false, resizeHelios:false}) {
		// weak reference to helios
		this._helios = helios;
		this._isCollapsed = options?.collapsed;
		this._resizeHelios = options?.resizeHelios;
		this._createContainerPanel();
	}

	_createContainerPanel() {
		this.panelContainer = document.createElement('div');
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
		this.toggleButton.style.height = '100px';
		this.toggleButton.style.backgroundColor = 'rgba(75, 75, 75, 0.45)';
		this.toggleButton.style.color = 'white';
		this.toggleButton.style.textAlign = 'center';
		this.toggleButton.style.lineHeight = '100px';
		this.toggleButton.style.cursor = 'pointer';
		if(this._isCollapsed){
			this.toggleButton.textContent = '◀';
			this.panelContainer.style.right = '-255px';
		}else{
			this.toggleButton.textContent = '▶';
			this.panelContainer.style.right = '0px';
		}
		if(this._resizeHelios){
			// enable animations in css
			this._helios.canvasElement.style.transition = 'padding-right 0.3s ease';
			console.log(this.panelContainer.style.right)
			this._helios.canvasElement.style.paddingRight = this._isCollapsed?"0px":"255px";
			this._helios.svgLayer.style.paddingRight = this._isCollapsed?"0px":"255px";
		}
		this.panel.appendChild(this.toggleButton);

		this.toggleButton.addEventListener('click', () => {
			this.toggleCollapse();
		});

		this.pane = new Pane({
			container: this.panel,
			// title: 'Helios',
		});
		this.settings = {
			// Helios Visuals
			shaded: false,
			advancedEdges: false,
			darkMode: false,
				blendings: "normal", // Only for darkMode
			// Nodes
			nodeSizeScale: 1.0,
			// Nodes Colors
				nodeColorProperty:"index",
				nodeColorMap:"viridis",
			nodeOutlineScale:1.0,
			// Edges
			edgeOpacityScale: 0.1,
			// Density
			densityEnabled: false,
			densityProperty:"uniform",
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

	}

	toggleCollapse() {
		if (!this._isCollapsed) {
			this.panelContainer.style.right = '-255px';
			this.toggleButton.textContent = '◀';
		} else {
			this.panelContainer.style.right = '0';
			this.toggleButton.textContent = '▶';
		}
		if(this._resizeHelios){
			this._helios.canvasElement.style.paddingRight = this._isCollapsed?"250px":"0px";
			this._helios.svgLayer.style.paddingRight = this._isCollapsed?"250px":"0px";
		}
		this._isCollapsed = !this._isCollapsed;
	}

	isCollapsed() {
		return this._isCollapsed;
	}
	
	
	addHeliosPropertiesPane(){
		this.visualPropertiesPanel = this.pane.addFolder({
			title: 'Node Visuals',
			expanded: true,
		});
		this.visualPropertiesPanel.addInput(this.settings, 'edgeOpacityScale',{
			min: 0,
			max: 255,
			step: 1,
			
			format: (v) => v/255.0,
			label: 'Edge Opacity',
		});
	}

}