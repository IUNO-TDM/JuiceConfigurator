// ******************************************
//   Conversion Utilities
// ******************************************
var milliliterPerMillisecond = 0.01;
var pixelPerMilliliter = 1;

function convertMilliliterToMilliseconds(milliliter) {
	var milliseconds = parseInt(milliliter) / milliliterPerMillisecond;
	return milliseconds;
}

function convertMillisecondsToMilliliter(milliseconds) {
	var milliliter = parseInt(milliseconds) * milliliterPerMillisecond;
	return milliliter;
}

function convertMilliliterToPixel(milliliter) {
	var pixel = parseInt(milliliter) * pixelPerMilliliter;
	// console.log("milliliter = "+milliliter+" -> pixel = "+pixel+", pixelPerMilliliter = "+pixelPerMilliliter);
	return pixel;
}

function convertPixelToMilliliter(pixel) {
	var milliliter = parseInt(pixel) / pixelPerMilliliter;
	return milliliter;
}

var currentId = 0;
function recipeGetNewId() {
	currentId += 1;
	return "recipe-id-" + currentId;
}

function Ingredient(id, name, description) {
	this.id = id;
	this.name = name;
	this.description = description;
}

function Phase(start, milliliter, throughput) {
	this.id = recipeGetNewId();
	this.sequence = null;
	this.milliliter = milliliter;
	this.start = start;
	this.throughput = throughput;
	this.htmlElement = null;

	this.getEnd = function() {
		var end = this.start + this.milliliter * 100 / this.throughput;
		return end;
	}

	this.toJSON = function() {
		var json = {}; 
		json['start'] = this.start;
		json['amount'] = this.milliliter;
		json['throughput'] = this.throughput;
		return json;
	}
}

Phase.fromJSON = function(json) {
	var start = json['start'];
	var amount = json['amount'];
	var throughput = json['throughput'];
	var phase = new Phase(start, amount, throughput);
	return phase;
}

function Sequence(ingredientId) {
	// this.recipe = null;
	this.ingredientId = ingredientId;
	this.id = recipeGetNewId();
	this.type = 'user';
	this.phases = [];

	this.clear = function() {
		this.phases = [];
	}

	this.addPhase = function(phase) {
		phase.sequence = this;
		this.phases.push(phase);
	}

	this.splitPhase = function(phase, milliliter) {
		phase.milliliter -= milliliter;
		var newPhaseStart = phase.start + phase.milliliter * 100 / phase.throughput;
		var newPhase = new Phase(newPhaseStart, milliliter, phase.throughput);
		newPhase.sequence = this;
		// insert new Phase into phase array
		for (var i = 0; i < this.phases.length; i += 1) {
			var p = this.phases[i];
			if (p == phase) {
				this.phases.splice(i+1, 0, newPhase);
				break;
			}
		}
	}

	this.getTotal = function() {
		var total = 0;
		this.phases.forEach(function(phase) {
			total += phase.milliliter;
		});
		return total;
	}

	this.toJSON = function() {
		var json = {};
		json['ingredient-id'] = ingredientId;
		var jsonPhases = [];
		this.phases.forEach(function(phase) {
			var jsonPhase = phase.toJSON();
			jsonPhases.push(jsonPhase);
		});
		json['phases'] = jsonPhases;
		return json;
	}
}

Sequence.fromJSON = function(json) {
	var ingredientId = json['ingredient-id'];
	var sequence = new Sequence(ingredientId);
	var phases = json['phases'];
	phases.forEach(function(p) {
		var phase = Phase.fromJSON(p);
		sequence.addPhase(phase);
	});
	return sequence;
}

function Recipe() {
	this.title = '';
	this.description = '';
	this.shortDescription = '';
	this.program = new Program();
	this.licenseFee = -1;

	this.toJSON = function() {
		var json = {};
		json['title'] = this.title;
		json['short-description'] = this.shortDescription;
		json['description'] = this.description;
		json['license-fee'] = this.licenseFee;
		json['program'] = this.program.toJSON();
		return json;
	}
}

Recipe.fromJSON = function(json) {
	var recipe = new Recipe();
	recipe.title = json['title'];
	recipe.shortDescription = json['short-description'];
	recipe.description = json['description'];
	recipe.licenseFee = json['license-fee'];
	recipe.program = Program.fromJSON(json['program']);
	return recipe;
}

function Program() {
	this.sequences = [];
	this.pauseSequence = new Sequence(null);
	this.pauseSequence.type = 'pause';

	this.toJSON = function() {
		var json = {};
		var seq = [];
		this.sequences.forEach(function(sequence) {
			seq.push(sequence.toJSON());
		});
		json['sequences'] = seq;
		return json;
	}

	this.addSequence = function(sequence) {
		this.sequences.push(sequence);
		this.updatePauses();
	}

	this.getBounds = function() {
		var bounds = [10000, 0];
		this.sequences.forEach(function(sequence) {
			sequence.phases.forEach(function(phase) {
				bounds[0] = Math.min(bounds[0], phase.start);
				bounds[1] = Math.max(bounds[1], phase.start + phase.milliliter * 100 / phase.throughput);
			});
		});
		return bounds;
	}

	this.updatePauses = function() {
		this.pauseSequence.clear();
		var bounds = this.getBounds();
		var span = bounds[1]-bounds[0];
		if (span > 0) {
			var pausePhases = [new Phase(bounds[0], bounds[1]-bounds[0], 100)];
			this.sequences.forEach(function(sequence) {
				sequence.phases.forEach(function(phase) {
					var temp = [];
					var phaseEnd = phase.start + phase.milliliter * 100 / phase.throughput;
					pausePhases.forEach(function(pause) {
						var pauseStart = pause.start;
						var pauseEnd = pauseStart + pause.milliliter; // always 100% throughput
						if (pauseEnd <= phase.start) { // no overlap
							temp.push(pause);
						} else if (pauseStart >= phaseEnd) { // no overlap
							temp.push(pause);
						} else if (pauseStart >= phase.start && pauseEnd <= phaseEnd) { // pause inside phase, remove pause
							// nothing to do
						} else if (pauseStart < phase.start && pauseEnd > phaseEnd) { // split
							pause.start = pauseStart;
							pause.milliliter = phase.start - pauseStart;
							var pauseRight = new Phase(phaseEnd, pauseEnd - phaseEnd, 100);
							temp.push(pause);
							temp.push(pauseRight);
						} else if (pauseStart < phase.start && pauseEnd <= phaseEnd) { // cut right X
							pause.start = pauseStart;
							pause.milliliter = phase.start - pauseStart;
							temp.push(pause);
						} else if (pauseStart < phaseEnd && pauseEnd > phaseEnd) { // cut left
							pause.start = phaseEnd;
							pause.milliliter = pauseEnd - phaseEnd;
							temp.push(pause);
						}
					});
					pausePhases = temp;
				});
			});

			pausePhases.forEach(function(phase) {
				this.pauseSequence.addPhase(phase);
			}.bind(this));
		}
		// var logMessage = "Pauses:\n----------------------------\n";
		// pausePhases.forEach(function(pause) {
		// 	logMessage += "   Pause start = "+pause.start+", end = "+pause.milliliter+" \n";
		// });
		// console.log(logMessage);
	}
}

Program.fromJSON = function(json) {
	var program = new Program();
	var jsonSequences = json['sequences'];
	jsonSequences.forEach(function(jsonSequence) {
		var s = Sequence.fromJSON(jsonSequence);
		program.addSequence(s);
	});
	return program;
}
