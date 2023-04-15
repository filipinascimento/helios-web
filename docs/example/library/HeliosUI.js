//class HeliosUI

import { Pane } from "tweakpane";
document.documentElement.style.setProperty('--tp-base-border-radius', '0px');

export default class HeliosUI {
	constructor(helios,options={collapsed:false}) {
		// weak reference to helios
		this._helios = helios;
		this._isCollapsed = options?.collapsed||false;
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
		this.toggleButton.style.left = '-20px';
		this.toggleButton.style.width = '20px';
		this.toggleButton.style.height = '30px';
		this.toggleButton.style.backgroundColor = 'rgba(75, 75, 75, 0.2)';
		this.toggleButton.style.color = 'white';
		this.toggleButton.style.textAlign = 'center';
		this.toggleButton.style.lineHeight = '30px';
		this.toggleButton.style.cursor = 'pointer';
		if(this._isCollapsed){
			this.toggleButton.textContent = '◀';
			this.panelContainer.style.right = '-250px';
		}else{
			this.toggleButton.textContent = '▶';
			this.panelContainer.style.right = '0px';
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
			nodeSizeScale: 1.0,
			edgeOpacityScale: 0.0,
			

		};
		this.addHeliosPropertiesPane();

	}

	toggleCollapse() {
		if (!this._isCollapsed) {
			this.panelContainer.style.right = '-250px';
			this.toggleButton.textContent = '◀';
		} else {
			this.panelContainer.style.right = '0';
			this.toggleButton.textContent = '▶';
		}
		this._isCollapsed = !this._isCollapsed;
	}

	isCollapsed() {
		return this._isCollapsed;
	}
	
	
	addHeliosPropertiesPane(){
		this.visualPropertiesPanel = this.pane.addFolder({
			title: 'Visual Properties',
			expanded: true,
		});
		this.visualPropertiesPanel.addInput(this.settings, 'edgeOpacityScale',{
			min: 0,
			max: 255,
			step: 1,
			
			// format: (v) => v/255.0,
			label: 'Edge Opacity',
		});
	}

}