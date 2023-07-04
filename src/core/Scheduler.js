

// //dictionary
export class HeliosScheduler {
	constructor(helios, { FPS = 60, throttle = true, maxQueueLength = 10 }) {
		// TODO: Check if Weakref is needed
		this.helios = helios;
		this.needsRender = false;
		this.needsUpdateNodesGeometry = false;
		this.needsUpdateEdgesGeometry = false;
		this._FPS = FPS;
		this._throttle = throttle; // will throttle to the requested FPS
		this._maxQueueLength = maxQueueLength;
		this._started = false;
		this._paused = true;
		this._lastFPS = 0;
		this._averageFPS = 0;
		this._tasks = {};
		this._executionCount = 0,
		this._lastTimestamp = null,
		this._currentTimestamp = null,
		this._lastExecutionTimestamp = null,
		this._lastRequestFrameID = 0;
		this._timeout = null;
		this._times = [];
		this._lastRepeatInterval = 0;
		this._shouldCleanup = false;
	}

	FPS(value) {
		if (value === undefined) {
			return this.FPS;
		}
		this.FPS = value;
		return this;
	}

	schedule({
		name = "default",
		callback = null,
		delay = 0,
		repeat = false,
		maxRepeatCount = Infinity,
		maxRepeatTime = Infinity,
		repeatInterval = 0,
		synchronized = true,
		immediateUpdates = false,
		updateNodesGeometry = false,
		updateEdgesGeometry = false,
		afterRedraw = false,
		redraw = true,
		replace = true
	}) {

		let newTask = {
			name,
			callback,
			delay,
			repeat,
			maxRepeatCount,
			maxRepeatTime,
			repeatInterval,
			synchronized,
			immediateUpdates,
			updateNodesGeometry,
			updateEdgesGeometry,
			afterRedraw,
			redraw,
			replace,
			executionCount: 0,
			lastTimestamp: window.performance.now(),
			lastExecutionTime: 0,
			shouldBeRemoved: false,
			cancel: function () {
				this.shouldBeRemoved = true;
				if (!this.synchronized) {
					clearTimeout(this._timeout)
				}
			}
		}

		if (!(name in this._tasks)) {
			this._tasks[name] = [];
		}

		if (replace) {
			this._clearTask(name);
		}

		if (!synchronized) {
			this.runAsyncTask(newTask, newTask.delay);
		}

		this._addTaskToQueue(newTask, name);

		if (this._paused && this._started) {
			this._updateTimeout();
		}
		return this;
	}

	runAsyncTask(newTask, delay = 0) {
		this._executionCount+=1;
		newTask.timeout = setTimeout(() => {
			if (newTask.shouldBeRemoved) {
				return;
			}
			let currentTimestamp = window.performance.now();
			let elapsedTime = currentTimestamp - newTask.lastTimestamp;
			newTask.callback?.(elapsedTime, newTask);
			newTask.executionCount += 1;
			if (newTask.immediateUpdates) {
				this._updateHelios(newTask.needsRender, newTask.needsUpdateNodesGeometry, newTask.needsUpdateEdgesGeometry);
			} else {
				if (newTask.redraw) {
					this.needsRender = true;
				}
				if (newTask.updateNodesGeometry) {
					this.needsUpdateNodesGeometry = true;
				}
				if (newTask.updateEdgesGeometry) {
					this.needsUpdateEdgesGeometry = true;
				}
			}
			if (newTask.repeat) {
				let newCurrentTimestamp = window.performance.now();
				newTask.lastExecutionTime = newCurrentTimestamp - currentTimestamp;
				newTask.lastTimestamp = currentTimestamp;
				let repeatInterval = newTask.repeatInterval - (newCurrentTimestamp - currentTimestamp)
				if (repeatInterval < 0) {
					repeatInterval = 0;
				}
				if (newTask.executionCount >= newTask.maxRepeatCount) {
					newTask.shouldBeRemoved = true;
				}else{
					this.runAsyncTask(newTask, repeatInterval);
				}
			} else {
				newTask.shouldBeRemoved = true;
			}
			if(this._started && this._paused){
				this._updateTimeout();
			}
		}, delay);
	}

	_executeTask(task,elapsedTime,currentTimestamp){
		// console.log("Executing "+task.name+" task at iteration "+task.executionCount+"")
		task.callback?.(elapsedTime, task);
		if(task === undefined){
			return false;
		}
		task.executionCount += 1;
		if (task.repeat && task.executionCount < task.maxRepeatCount) {
			let newCurrentTimestamp = window.performance.now();
			task.lastExecutionTime = newCurrentTimestamp - currentTimestamp;
			task.lastTimestamp = currentTimestamp;
		} else {
			task.shouldBeRemoved = true;
		}
		return true;
	}

	runSyncTasks() {
		if(this._shouldCleanup){
			return;
		}
		this._executionCount+=1;
		let afterRedrawTasks = [];
		let allTasksCurrentTimestamp = window.performance.now();
		for (let taskName of Object.keys(this._tasks).sort()) {
			let task = this._tasks[taskName];
			for (let i = 0; i < task.length; i++) {
				if(task[i].synchronized || !task[i].immediateUpdates){
					if(task[i].redraw){
						this.needsRender = true;
					}
					if(task[i].updateNodesGeometry){
						this.needsUpdateNodesGeometry = true;
					}
					if(task[i].updateEdgesGeometry){
						this.needsUpdateEdgesGeometry = true;
					}
				}

				if (!task[i]?.shouldBeRemoved) {
					let currentTimestamp = window.performance.now();
					let elapsedTime = currentTimestamp - task[i].lastTimestamp + task[i].lastExecutionTime;
					if (elapsedTime < 0) {
						elapsedTime = 0;
					}
					let willExecute = false
					if (task[i].executionCount == 0) {
						if (elapsedTime >= task[i].delay) {
							willExecute = true;
						}
					} else {
						if (elapsedTime >= task[i].repeatInterval) {
							willExecute = true;
						}
					}
					if (willExecute) {
						if(task[i].afterRedraw){
							afterRedrawTasks.push({
								task:task[i],
								elapsedTime,
								currentTimestamp,
							});
						}else{
							if(!this._executeTask(task[i],elapsedTime,currentTimestamp)){
								break;
							}
						}

					}
				}
				if (task[i]?.shouldBeRemoved) {
					task.splice(i, 1);
					i--;
				}
			}
			if (task.length == 0) {
				delete this._tasks[taskName];
			}
		}
		this._updateHelios(this.needsRender, this.needsUpdateNodesGeometry, this.needsUpdateEdgesGeometry, true, afterRedrawTasks);
		this._lastTimestamp = allTasksCurrentTimestamp;
	}


	_updateHelios(needsRender, needsUpdateNodesGeometry, needsUpdateEdgesGeometry, updateTimeoutAfterRender,afterRedrawTasks) {
		if (needsRender === undefined) {
			needsRender = this.needsRender;
		}
		if (needsUpdateNodesGeometry === undefined) {
			needsUpdateNodesGeometry = this.needsUpdateNodesGeometry;
		}
		if (needsUpdateEdgesGeometry === undefined) {
			needsUpdateEdgesGeometry = this.needsUpdateEdgesGeometry;
		}

		if (needsUpdateNodesGeometry) {
			this.helios.updateNodesGeometry();
			this.needsUpdateNodesGeometry = false;
		}

		if (needsUpdateEdgesGeometry) {
			this.helios.updateEdgesGeometry();
			this.needsUpdateEdgesGeometry = false;
		}

		cancelAnimationFrame(this.lastRequestFrameID);
		this.lastRequestFrameID = requestAnimationFrame(() => {
			// console.log("Executed: "+this.lastRequestFrameID);
			if(this._shouldCleanup){
				return;
			}
			const now = window.performance.now();
			while (this._times.length > 0 && this._times[0] <= now - 1000) {
				this._times.shift();
			}
			this._times.push(now);
			this._averageFPS = this._times.length;
			// console.log(this._averageFPS);

			// if (needsUpdateNodesGeometry) {
			// 	this.helios.updateNodesGeometry();
			// 	this.needsUpdateNodesGeometry = false;
			// }

			// if (needsUpdateEdgesGeometry) {
			// 	this.helios.updateEdgesGeometry();
			// 	this.needsUpdateEdgesGeometry = false;
			// }

			if (needsRender) {
				this.helios.redraw();
				this.needsRender = false;
			}
			if((afterRedrawTasks?.length ||0) > 0){
				afterRedrawTasks.forEach((task) => {
					task.task._timeout = setTimeout(() => {
						this._executeTask(task.task,task.elapsedTime,task.currentTimestamp);
					}, 0);
				});
			}
			if (updateTimeoutAfterRender) {
				this._lastExecutionTimestamp = window.performance.now();
				this._updateTimeout();
			}
		});
		// console.log("Requested: "+this.lastRequestFrameID);
	}

	_addTaskToQueue(task, name) {
		let taskQueue = this._tasks[name];
		taskQueue.push(task);
		if (taskQueue.length > this._maxQueueLength) {
			if (taskQueue[0].timeout) {
				taskQueue[0].shouldBeRemoved = true;
				clearTimeout(task.taskQueue[0]);
			}
			taskQueue.shift();
			console.warn(`One task was discarded because of too many tasks in the ${name} queue. (maxQueueLength = ${this._maxQueueLength})`);
		}
	}

	_clearTask(name) {
		if (name in this._tasks) {
			let taskQueue = this._tasks[name];
			for (let taskIndex = 0; taskIndex < taskQueue.length; taskIndex++) {
				let task = taskQueue[taskIndex];
				if (task.timeout) {
					task.shouldBeRemoved = true;
					clearTimeout(task.timeout);
				}
			}
			taskQueue.length = 0;
		}
	}

	unschedule(name) {
		
		if (name in this._tasks) {
			this._clearTask(name);
			delete this._tasks[name];
		}
		this._updateTimeout();
		return this;
	}

	hasTask(name) {
		return name in this._tasks;
	}


	start() {
		this._started = true;
		this._updateTimeout();
		return this;
	}



	stop() {
		this._shouldCleanup = true;
		clearTimeout(this._timeout);
		this.paused = false;
		this.started = false;
		this._lastTimestamp = null;
		this._lastExecutionTime = 0;
		return this;
	}

	_updateTimeout() {
		clearTimeout(this._timeout);
		if (this._started) {
			if (Object.keys(this._tasks).length === 0) {
				this.paused = true;
			} else {
				this.paused = false;
				let repeatInterval = 0
				let currentTimestamp = window.performance.now();
				if (this._lastTimestamp != null && this._throttle) {
					let fpsRepeatInterval = 1000 / this._FPS;
					repeatInterval = fpsRepeatInterval - (currentTimestamp-this._lastTimestamp)
					if (repeatInterval < 0) {
						repeatInterval = 0;
					}
				}

				this._lastFPS = 1000 / ((currentTimestamp-this._lastTimestamp));
				// this._lastTimestamp = this._currentTimestamp;
				
				this._timeout = setTimeout(() => {
					this.runSyncTasks();
				}, repeatInterval);
			}
		}
	}

}