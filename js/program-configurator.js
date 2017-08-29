// ******************************************
//   Conversion Utilities
// ******************************************
var milliliterPerMillisecond = 0.01;

function convertMilliliterToMilliseconds(milliliter) {
	var milliseconds = parseInt(milliliter) / milliliterPerMillisecond;
	return milliseconds;
}

function convertMillisecondsToMilliliter(milliseconds) {
	var milliliter = parseInt(milliseconds) * milliliterPerMillisecond;
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

	this.addSequence = function(sequence) {
		this.sequences.push(sequence);
		this.updatePauses();
	}

	this.removeSequence = function(sequence) {
		this.sequences = this.sequences.filter(function(s) {
			return s.ingredientId != sequence.ingredientId;
		});
		this.updatePauses();
	}

	this.getBounds = function() {
		var bounds = [0, 0];
		var initial = true;
		this.sequences.forEach(function(sequence) {
			sequence.phases.forEach(function(phase) {
				if (initial) {
					bounds[0] = phase.start;
					bounds[1] = phase.start + phase.milliliter * 100 / phase.throughput;
					initial = false;
				} else {
					bounds[0] = Math.min(bounds[0], phase.start);
					bounds[1] = Math.max(bounds[1], phase.start + phase.milliliter * 100 / phase.throughput);
				}
			});
		});
		return bounds;
	}

	// moves phases so that the lowest phase starts at 0
	this.normalize = function() {
		var bounds = this.getBounds();
		this.sequences.forEach(function(sequence) {
			sequence.phases.forEach(function(phase) {
				phase.start -= bounds[0];
			});
		});
		this.updatePauses();
	}

	this.updatePauses = function() {
		this.pauseSequence.clear();
		var bounds = this.getBounds();
		var span = bounds[1]-bounds[0];
		// console.log("SPAN: "+span);
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

	this.toJSON = function() {
		var json = {};
		var seq = [];
		this.sequences.forEach(function(sequence) {
			seq.push(sequence.toJSON());
		});
		json['sequences'] = seq;
		return json;
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

var ingredients = [];

function getIngredientById(id) {
	var ingredient = null;
	ingredients.forEach(function(element) {
		if (element.id == id) {
			ingredient = element;
		}
	})
	return ingredient;
}

function openAddIngredientDialog(programConfigurator) {
	$("#dialog-add-ingredient-table").show();
	$("#dialog-add-ingredient-amount").hide();
	$( "#dialog-add-ingredient" ).dialog({
		autoOpen: false,
		resizable: false,
		height: "auto",
		width: 400,
		modal: true,
		buttons: {
			"Abbrechen": function() {
				$(this).dialog('close');
			}
		}
	});
	$( "#dialog-add-ingredient" )
		.data('configurator', programConfigurator)
		.dialog( "open" );
	ingredientSearch();
}

function openAddIngredientAmountDialog(ingredientId) {
	var ingredient = getIngredientById(ingredientId);
	var configurator = $( "#dialog-add-ingredient" ).data('configurator');
	$("#dialog-add-ingredient input[name=ingredientId]").val(ingredientId);
	$("#dialog-add-ingredient-table").hide();
	$("#dialog-add-ingredient-amount").show();
	$("#dialog-add-ingredient-amount .ingredient").html("Zutat: "+ingredient.name);
	$( "#dialog-add-ingredient" ).dialog(
		'option', {
			buttons: {
                "Hinzufügen": function() {
                    var configurator = $(this).data('configurator');
                    var ingredientId = $("#dialog-add-ingredient input[name=ingredientId]").val();
                    var amount = parseInt(addml.value);
                    configurator.addIngredient(ingredientId, amount);
                    $(this).dialog('close');
                },
				"Zutat ändern": function() {
					openAddIngredientDialog();
				},
				"Abbrechen": function() {
					$(this).dialog('close');
				}
			}
		}
	);
	$( "#dialog-add-ingredient" ).dialog( "open" );
}

function ProgramConfigurator(program, id) {
	this.program = program;
	this.id = id;
	this.pauseId = null;
	this.pixelPerMilliliter = 1;
	// this.dragObject = null;
	var contentWidth = 0;

	window.onresize = function() {
		// console.log("New width: "+window.innerWidth);
		var content = $("#"+id+" .content")[0];
		var newContentWidth = $(content).innerWidth();
		if (newContentWidth != contentWidth) {
			this.updateScales();
			contentWidth = newContentWidth;
		}
	}.bind(this);

	this.convertMilliliterToPixel = function(milliliter) {
		var pixel = parseInt(milliliter) * this.pixelPerMilliliter;
		return pixel;
	}

	this.convertPixelToMilliliter = function(pixel) {
		var milliliter = parseInt(pixel) / this.pixelPerMilliliter;
		return milliliter;
	}

	this.getStartOffset = function(start) {
		var bounds = this.program.getBounds();
		var startOffset = start - bounds[0];
		return startOffset;
	}

	this.updateScale = function() {
		var ppm = 1;
		var content = $("#"+id+" .content")[0];
		var contentWidth = $(content).innerWidth();
		var bounds = this.program.getBounds();
		var span = bounds[1]-bounds[0];
		if (span > 0) {
			ppm = contentWidth / span;
		}
		this.pixelPerMilliliter = ppm;
		// console.log("pixelPerMilliliter = "+ppm);
	}

	this.render = function() {
		console.log("Render!");
		var htmlProgram = $("#"+id);
		htmlProgram.html(""); // clear html element content
		var configurator = this;
		// add sequences
		this.program.sequences.forEach(function(sequence) {
			var htmlSequence = $("#program-sequence").clone();
			htmlSequence.attr("id", sequence.id);
			htmlProgram.append(htmlSequence);
			var htmlLabel = htmlSequence.find('.ingredient-label');
			var ingredient = getIngredientById(sequence.ingredientId)
			htmlLabel.html(ingredient.name)

			var htmlContent = htmlSequence.find('.content');
			htmlContent.html("");
			
			sequence.phases.forEach(function(phase) {
				var htmlPhase = $("#program-phase").clone();
				htmlPhase.attr("id", phase.id);

				htmlPhase.draggable({
					axis: "x",
					cursor: 'move',
					delay: 150,
					start: function(event, ui) {
						// configurator.dragObject = this;
						var offset = $(this).offset();
						var relX = event.pageX - offset.left;
						var relY = event.pageY - offset.top;
						draggingStartX = event.pageX;
						draggingStartY = event.pageY;
						draggingPhase = getPhaseFromHtmlElement(this);
						draggingPhaseStart = draggingPhase.start;
						draggingThroughputStart = draggingPhase.throughput;
						scale = configurator.pixelPerMilliliter;
						if (relX <= 15) {
							dragMode = 'left';
						} else if (relX >= $(this).width() - 30) {
							dragMode = 'right';
						} else {
							dragMode = 'center';
						}
					},
					stop: function(event, ui) {
						var bounds = configurator.program.getBounds();
						configurator.program.normalize();
						bounds = configurator.program.getBounds();
						configurator.phaseChanged();
						// configurator.dragObject = null;
					},
					drag: function(event, ui) {
						var remainingInterval = getRemainingInterval(this);
						var draggingInterval = getDraggingInterval(this);
						var dX = event.pageX - draggingStartX;
						var dY = event.pageY - draggingStartY;

						var phase = getPhaseFromHtmlElement(this);
						if (dragMode == 'center' || dragMode == 'left') { // move phase start
							var mlOffset = parseInt(dX) / scale;

							// calculate new phase start
							newStartMl = draggingPhaseStart + mlOffset;
							newStartMl = Math.round(newStartMl); // we do not want floating point numbers
							newStartMl = Math.max(draggingInterval[0], newStartMl); // restrict to dragging intervall (no overlap etc.)
							newStartMl = Math.min(draggingInterval[1], newStartMl); // restrict to dragging intervall (no overlap etc.)
							ui.helper.start = newStartMl;
							phase.start = newStartMl;
							configurator.phaseChanged();
							
							// set position of html object
							var startOffset = configurator.getStartOffset(phase.start) ;
							var newStartPx = configurator.convertMilliliterToPixel(startOffset);
							ui.position.left = newStartPx;
						} else if (dragMode == 'right') { // adjusting throughput
							// calculate minimum throughput
							var remainingIntervalSize = remainingInterval[1] - phase.start;
							var minimumThroughput = phase.milliliter * 100 / remainingIntervalSize;
							minimumThroughput = Math.max(30, minimumThroughput);
							minimumThroughput = Math.floor(minimumThroughput); //we do not want floating point numbers

							// calculate throughput
							var throughput = draggingThroughputStart - dX;
							throughput = Math.min(100, throughput);
							throughput = Math.max(minimumThroughput, throughput);

							phase.throughput = throughput;
							configurator.phaseChanged();
							// configurator.updateScales();

							// set position of html object
							var newStartPx = configurator.convertMilliliterToPixel(phase.start);
							ui.position.left = newStartPx;
						}
					},
				}).css("position", "absolute");

				htmlPhase.click(function(event) {
					$( "#dialog-phase" )
						.data('configurator', configurator)
						.data('phase', phase)
						.dialog('open');
				});

				htmlContent.append(htmlPhase);
			});

			var total = sequence.getTotal();
			var htmlTotal = htmlSequence.find('.program-row-total');
			htmlTotal = htmlTotal.find('.total-label');
			htmlTotal.html(total + " ml");

			var htmlAmountHref = htmlSequence.find('.change-amount');
			htmlAmountHref.click(function(event) {
				event.preventDefault();
				$( "#changeml").val(sequence.getTotal());
				$( "#dialog-change-amount" )
					.data('configurator', configurator)
					.data('sequence', sequence)
					.dialog('open');
			});
		});

		var htmlSequence = $("#program-pause").clone();
		htmlSequence.attr("id", this.program.pauseSequence.id);
		htmlProgram.append(htmlSequence);
		var htmlLabel = htmlSequence.find('.ingredient-label');
		htmlLabel.html("Pausen")

		var footer = $("#program-footer").clone();
		footer.attr("id", this.id + "-footer");
		var htmlAddIngredientHref = footer.find('.add-ingredient');
		htmlAddIngredientHref.click(function(event) {
			event.preventDefault();
			openAddIngredientDialog(configurator);
		});
		htmlProgram.append(footer);

		this.phaseChanged();
	};

	this.phaseChanged = function() {
		var configurator = this;
		program.updatePauses();
		this.updateScale();
		this.program.sequences.forEach(function(sequence) {
			sequence.phases.forEach(function(phase) {
				configurator.updatePhaseHtmlElement(phase);
			});
		});

		// var content = $("#program .content")[0];
		// var contentWidth = $(content).innerWidth();
		// var bounds = this.program.getBounds();
		// var span = bounds[1]-bounds[0];
		// if (span > 0) {
		// 	pixelPerMilliliter = contentWidth / span;
		// 	console.log("pixelPerMilliliter = "+pixelPerMilliliter);
		// 	this.program.sequences.forEach(function(sequence) {
		// 		sequence.phases.forEach(function(phase) {
		// 	// 		phase.start -= bounds[0];
		// 			updatePhaseHtmlElement(phase);
		// 		});
		// 	});
		// }
		this.renderPauses();
	}

	this.renderPauses = function() {
		var configurator = this;
		var htmlProgram = $("#"+id);
		var htmlSequence = $("#"+this.program.pauseSequence.id);
		if (this.program.pauseSequence.phases.length > 0) {
			htmlSequence.show();
		} else {
			htmlSequence.hide();
		}

		var htmlContent = htmlSequence.find('.content');
		htmlContent.html("");

		this.program.pauseSequence.phases.forEach(function(phase) {
			var htmlPhase = $("#program-pause-phase").clone();
			htmlPhase.attr("id", phase.id);
			htmlContent.append(htmlPhase);
			configurator.updatePhaseHtmlElement(phase);

			var label = $("#"+phase.id+" .phase-content-label")[0];
			var s = convertMilliliterToMilliseconds(phase.milliliter) / 1000;
			var text = s + " s";
			label.innerHTML = text;
		});

		var htmlTotal = htmlSequence.find('.program-row-total .label');
		var total = this.program.pauseSequence.getTotal();
		var seconds = convertMilliliterToMilliseconds(total) / 1000;
		htmlTotal.html(seconds + " s");
	}

	this.changeAmount = function(sequence, amount) {
		if (amount > 0) {
			var total = 0;
			sequence.phases.forEach(function(phase) {
				total += phase.milliliter;
			});
			var difference = amount - total;
			if (difference > 0) {
				sequence.phases[sequence.phases.length - 1].milliliter += difference;
			} else if (difference < 0) {
				for (var i = sequence.phases.length - 1; i > 0; i -= 1) {
					var phase = sequence.phases[i];
					if (total - phase.milliliter < amount) {
						break;
					} else {
						sequence.phases.pop();
						total -= phase.milliliter;
					}
				}
				difference = amount - total;
				if (difference < 0) {
					sequence.phases[sequence.phases.length - 1].milliliter += difference;
				}
			} else {
				// nothing to do.
			}
			this.render();
		}
	}

	this.splitPhase = function(phase, amount) {
		console.log("Should split "+amount+" ml from phase id "+phase.id);
		var sequence = phase.sequence;
		sequence.splitPhase(phase, amount);
		this.render();
	}

	this.addIngredient = function(ingredientId, amount) {
		if (amount > 0) {
			var sequence = new Sequence(ingredientId);
			sequence.addPhase(new Phase(0, amount, 100));
			this.program.addSequence(sequence);
			this.render();
		}
	}

	this.removeSequence = function(sequence) {
		this.program.removeSequence(sequence);
		this.render();
	}

	this.deleteSequence = function(sequence) {
		this.program.removeIngredient
	}

	this.deletePhase = function(phase) {
		console.log("Should delete phase id "+phase.id);
		var sequence = phase.sequence;
		var mlDeleted = phase.milliliter;
		if (sequence.phases.length > 1) {
			var newPhases = [];
			for (var i = 0; i < sequence.phases.length; i += 1) {
				var p = sequence.phases[i];
				if (p != phase) {
					newPhases.push(p);
				}
			}
			newPhases[newPhases.length-1].milliliter += mlDeleted;
			sequence.phases = newPhases;
			this.render();
		} else {
			// error
		}
	}

	var defaultPhaseHeight = 37;

	this.updatePhaseHtmlElement = function(phase) {
		var htmlElement = $("#"+phase.id)[0];
		var bounds = this.program.getBounds();
		var mlStart = phase.start - bounds[0];
		var ml = phase.milliliter;
		var throughput = phase.throughput;
		var mlWidth = ml * 100 / throughput;
		var start = this.convertMilliliterToPixel(mlStart)+"px";
		var width = this.convertMilliliterToPixel(mlWidth)+"px";
		var height = (defaultPhaseHeight * throughput / 100) + "px";
		var marginTop = (defaultPhaseHeight - parseInt(height)) / 2 + "px";
		htmlElement.style.left = start;
		htmlElement.style.width = width;

		var mlBox = $("#"+phase.id+" .phase-content-throughput")[0];
		if (mlBox != null) {
			mlBox.style.height = height;
			mlBox.style.marginTop = marginTop;
		}

		var label = $("#"+phase.id+" .phase-content-label")[0];
		// label.style.marginTop = marginTop;
		// label.style.width = width;
		// label.style.height = defaultPhaseHeight+"px";
		// label.style.lineHeight = defaultPhaseHeight+"px";
		var text = phase.milliliter+" ml";
		if (phase.throughput != 100) {
			text = phase.milliliter+" ml ("+throughput+" %)";
		}
		label.innerHTML = text;
	}

	function getPhaseFromHtmlElement(htmlElement) {
		var id = htmlElement.id;
		var phase = null;
		program.sequences.forEach(function(sequence) {
			sequence.phases.forEach(function(p) {
				if (p.id == htmlElement.id) {
					phase = p;
				}
			});
		});
		return phase;
	}

	// calculates the space between the previous phase and the next phase
	function getRemainingInterval(phaseDiv) {
		var interval = [-10000, 10000];
		for (var i = 0; i < program.sequences.length; i += 1) {
			var sequence = program.sequences[i];
			var processingPhase = null;
			var interval = [-10000, 10000];
			for (var j = 0; j < sequence.phases.length; j += 1) {
				var phase = sequence.phases[j];
				if (phase.id == phaseDiv.id) {
					processingPhase = phase;
				} else {
					if (processingPhase == null) {
						interval[0] = phase.start + phase.milliliter * 100 / phase.throughput;
					} else {
						interval[1] = phase.start
						break;
					}
				}
			}
			if (processingPhase != null) {
				break;
			}
		}
		return interval;
	}

	function getDraggingInterval(phaseDiv) {
		var interval = getRemainingInterval(phaseDiv);
		var phase = getPhaseFromHtmlElement(phaseDiv);
		interval[1] = interval[1] - phase.milliliter * 100 / phase.throughput;
		return interval;
	}
}

/************************************************************
 * Dialogs
 ************************************************************/
$(function() {
	$( "#dialog-change-amount" ).dialog({
		autoOpen: false,
		resizable: false,
		height: "auto",
		width: 400,
		modal: true,
		buttons: {
			"Zutat entfernen": function() {
				var configurator = $(this).data('configurator');
				var sequence = $(this).data('sequence');
				configurator.removeSequence(sequence);
				$(this).dialog('close');
			},
			"Menge ändern": function() {
				var configurator = $(this).data('configurator');
				var sequence = $(this).data('sequence');
				var amount = parseInt(changeml.value);
				configurator.changeAmount(sequence, amount);
				$(this).dialog('close');
			},
			"Abbrechen": function() {
				$(this).dialog('close');
			}
		}
	});

	$( "#dialog-phase" ).dialog({
		autoOpen: false,
		resizable: false,
		height: "auto",
		width: 400,
		modal: true,
		open: function() {
			$('.ui-widget-overlay').addClass('custom-overlay');
		},
		close: function() {
			$('.ui-widget-overlay').removeClass('custom-overlay');
		},
		buttons: {
			"Verschmelzen": function() {
				var configurator = $(this).data('configurator');
				var phase = $(this).data('phase');
				configurator.deletePhase(phase)
				$(this).dialog('close');
			},
			"Phase teilen": function() {
				var configurator = $(this).data('configurator');
				var phase = $(this).data('phase');
				var amount = parseInt(splitml.value);
				configurator.splitPhase(phase, amount)
				$(this).dialog('close');
			},
			"Abbrechen": function() {
				$(this).dialog('close');
			}
		}
	});

	// $( ".phase" ).hover(function() {
	// 	if (dragObject == null) {
	// 		$(this).find('.phase-controls').show();
	// 	}
	// }, function() {
	// 	if (dragObject == null) {
	// 		$(this).find('.phase-controls').hide();
	// 	}
	// });
});

