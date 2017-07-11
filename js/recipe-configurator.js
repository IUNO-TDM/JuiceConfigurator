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
}

function Sequence(ingredient) {
	this.recipe = null;
	this.ingredient = ingredient;
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
}

function Recipe(name) {
	this.name = name;
	this.sequences = [];
	this.pauseSequence = new Sequence(null);
	this.pauseSequence.type = 'pause';
	this.pauseSequence.recipe = this;

	this.addSequence = function(sequence) {
		sequence.recipe = this;
		this.sequences.push(sequence);
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
		var bounds = this.getBounds();
//			var pausePhases = [new Phase(pauses, bounds[0], bounds[1]-bounds[0], 100)];
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

		this.pauseSequence.clear();
		pausePhases.forEach(function(phase) {
			this.pauseSequence.addPhase(phase);
		}.bind(this));
		// var logMessage = "Pauses:\n----------------------------\n";
		// pausePhases.forEach(function(pause) {
		// 	logMessage += "   Pause start = "+pause.start+", end = "+pause.milliliter+" \n";
		// });
		// console.log(logMessage);
	}

}

var dialogConfigurator = null;
var selectedPhase = null;
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

function splitPhaseHelper() {
	dialogConfigurator.splitPhase();
}

function deletePhaseHelper() {
	dialogConfigurator.deletePhase();
}

function addIngredient() {
	dialogConfigurator.addIngredient();
}

function openAddIngredientDialog() {
	$("#dialog-add-ingredient-table").show();
	$("#dialog-add-ingredient-amount").hide();
	dialogAddIngredient = $( "#dialog-add-ingredient" ).dialog({
		autoOpen: false,
		resizable: false,
		height: "auto",
		width: 400,
		modal: true,
		buttons: {
			// "Hinzufügen": addIngredient,
			"Abbrechen": function() {
			$( this ).dialog( "close" );
			}
		}
	});
	$( "#dialog-add-ingredient" ).dialog( "open" );
}

function openAddIngredientAmountDialog(ingredientId) {
	var ingredient = getIngredientById(ingredientId);
	$("#dialog-add-ingredient input[name=ingredientId]").val(ingredientId);
	$("#dialog-add-ingredient-table").hide();
	$("#dialog-add-ingredient-amount").show();
	$("#dialog-add-ingredient-amount .ingredient").html("Zutat: <a href='javascript:openAddIngredientDialog()'>"+ingredient.name+"</a>");
	$( "#dialog-add-ingredient" ).dialog(
		'option', {
		buttons: {
			"Hinzufügen": addIngredient,
			"Abbrechen": function() {
				$( this ).dialog( "close" );
			}
		}
		}
	);
	$( "#dialog-add-ingredient" ).dialog( "open" );
}


function RecipeConfigurator(recipe, id) {
	this.recipe = recipe;
	this.id = id;
	this.pauseId = null;
	dialogConfigurator = this;

	var contentWidth = 0;
	window.onresize = function() {
		// console.log("New width: "+window.innerWidth);
		var content = $("#"+id+" .content")[0];
		var newContentWidth = $(content).width();
		if (newContentWidth != contentWidth) {
			this.updateScales();
			contentWidth = newContentWidth;
		}
	}.bind(this);

	dialogPhase = $( "#dialog-phase" ).dialog({
		autoOpen: false,
		resizable: false,
		height: "auto",
		width: 400,
		modal: true,
		buttons: {
			"Abspalten": splitPhaseHelper,
			"Löschen": deletePhaseHelper,
			"Abbrechen": function() {
			$( this ).dialog( "close" );
			}
		}
	});

	// dialogAddIngredient = $( "#dialog-add-ingredient" ).dialog({
	// 	autoOpen: false,
	// 	resizable: false,
	// 	height: "auto",
	// 	width: 400,
	// 	modal: true,
	// 	buttons: {
	// 		"Hinzufügen": addIngredient,
	// 		"Abbrechen": function() {
	// 		$( this ).dialog( "close" );
	// 		}
	// 	}
	// });

	this.render = function() {
		var htmlRecipe = $("#"+id);
		htmlRecipe.html(""); // clear html element content
		// add sequences
		this.recipe.sequences.forEach(function(sequence) {
			var htmlSequence = $("#recipe-sequence").clone();
			htmlSequence.attr("id", sequence.id);
			htmlRecipe.append(htmlSequence);
			var htmlLabel = htmlSequence.find('.label');
			htmlLabel.html(sequence.ingredient.name)

			var htmlContent = htmlSequence.find('.content');
			htmlContent.html("");
			
			sequence.phases.forEach(function(phase) {
				var htmlPhase = $("#recipe-phase").clone();
				htmlPhase.attr("id", phase.id);
				htmlContent.append(htmlPhase);
			});
		});

		var htmlSequence = $("#recipe-pause").clone();
		htmlSequence.attr("id", this.recipe.pauseSequence.id);
		htmlRecipe.append(htmlSequence);
		var htmlLabel = htmlSequence.find('.label');
		htmlLabel.html("Pausen")

		var footer = $("#recipe-footer").clone();
		footer.attr("id", this.id + "-footer");
		htmlRecipe.append(footer);

		this.updateScales();
		this.refreshDragging();
	}

	this.updateScales = function() {
		recipe.updatePauses();
		var content = $("#recipe .content")[0];
		var contentWidth = $(content).width() - 20;
		var bounds = this.recipe.getBounds();
		var span = bounds[1]-bounds[0];
		if (span > 0) {
			pixelPerMilliliter = contentWidth / span;
			this.recipe.sequences.forEach(function(sequence) {
				sequence.phases.forEach(function(phase) {
					phase.start -= bounds[0];
					updatePhaseHtmlElement(phase);
				});
			});
		}
		this.renderPauses();
	}

	this.renderPauses = function() {
		var htmlRecipe = $("#"+id);
		var htmlSequence = $("#"+this.recipe.pauseSequence.id);
		if (this.recipe.pauseSequence.phases.length > 0) {
			htmlSequence.show();
		} else {
			htmlSequence.hide();
		}

		var htmlContent = htmlSequence.find('.content');
		htmlContent.html("");

		this.recipe.pauseSequence.phases.forEach(function(phase) {
			var htmlPhase = $("#recipe-pause-phase").clone();
			htmlPhase.attr("id", phase.id);
			htmlContent.append(htmlPhase);
			updatePhaseHtmlElement(phase);

			var label = $("#"+phase.id+" .phase-label")[0];
			var s = convertMilliliterToMilliseconds(phase.milliliter) / 1000;
			var text = s + " s";
			label.innerHTML = text;
		});
	}

	var defaultPhaseHeight = 37;

	function updatePhaseHtmlElement(phase) {
		var htmlElement = $("#"+phase.id)[0];
		var mlStart = phase.start;
		var ml = phase.milliliter;
		var throughput = phase.throughput;
		var mlWidth = ml * 100 / throughput;
		var start = convertMilliliterToPixel(mlStart)+"px";
		var width = convertMilliliterToPixel(mlWidth)+"px";
		var height = (defaultPhaseHeight * throughput / 100) + "px";
		var marginTop = (defaultPhaseHeight - parseInt(height)) / 2 + "px";
		htmlElement.style.left = start;
		htmlElement.style.width = width;

		var mlBox = $("#"+phase.id+" .phase-ml")[0];
		if (mlBox != null) {
			mlBox.style.height = height;
			mlBox.style.marginTop = marginTop;
		}

		var label = $("#"+phase.id+" .phase-label")[0];
		label.style.width = width;
		label.style.height = defaultPhaseHeight+"px";
		label.style.lineHeight = defaultPhaseHeight+"px";
		var text = phase.milliliter+" ml";
		if (phase.throughput != 100) {
			text = phase.milliliter+" ml ("+throughput+" %)";
		}
		label.innerHTML = text;
	}

	function getPhaseFromHtmlElement(htmlElement) {
		var id = htmlElement.id;
		var phase = null;
		recipe.sequences.forEach(function(sequence) {
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
		var interval = [-100, 1000];
		for (var i = 0; i < recipe.sequences.length; i += 1) {
			var sequence = recipe.sequences[i];
			var processingPhase = null;
			var interval = [-100, 1000];
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

	this.refreshDragging = function() {
		var dragObject = null;
		var dragMode = '';
		var configurator = this;
		$( ".phase" ).draggable({
			axis: "x",
			cursor: 'move',
			delay: 150,
			start: function(event, ui) {
				dragObject = this;
				var offset = $(this).offset();
				var relX = event.pageX - offset.left;
				var relY = event.pageY - offset.top;
				draggingX = event.clientX;
				draggingY = event.clientY;
				if (relX <= 15) {
					dragMode = 'left';
				} else if (relX >= $(this).width() - 15) {
					dragMode = 'right';
				} else {
					dragMode = 'center';
				}
				// console.log("x = "+relX+", y = "+relY+", dragMode: "+dragMode);
				// $(this).removeClass('over');
			},
			stop: function(event, ui) {
				// $(this).addClass('over');
				if (!$(event.target).parents(this).size()) {
					$(this).find('.phase-controls').hide();
				}
				dragObject = null;
			},
			drag: function(event, ui) {
				// console.log("drag mode = "+dragMode);
				var remainingInterval = getRemainingInterval(this);
				var draggingInterval = getDraggingInterval(this);
				var dX = event.clientX - draggingX;
				var dY = event.clientY - draggingY;
				draggingX = event.clientX;
				draggingY = event.clientY;

				var phase = getPhaseFromHtmlElement(this);
				if (dragMode == 'center' || dragMode == 'left') {
					// calculate start
					var dXMl = convertPixelToMilliliter(dX);
					var newStartMl = phase.start + dXMl;
					newStartMl = Math.max(draggingInterval[0], newStartMl);
					newStartMl = Math.min(draggingInterval[1], newStartMl);
					ui.helper.start = newStartMl;
					phase.start = newStartMl;
					configurator.updateScales();
					// update();
					var newStartPx = convertMilliliterToPixel(phase.start);
					ui.position.left = newStartPx;
				} else if (dragMode == 'right') {
					// calculate throughput
					var remainingIntervalSize = remainingInterval[1] - phase.start;//remainingInterval[0];
					var minimumThroughput = phase.milliliter * 100 / remainingIntervalSize;
					minimumThroughput = Math.max(30, minimumThroughput);
					// console.log("remainingIntervalSize = "+remainingIntervalSize+", ml = "+phase.milliliter+", minimumThroughput = "+minimumThroughput);
					var throughput = phase.throughput - dX;
					throughput = Math.min(100, throughput);
					throughput = Math.max(minimumThroughput, throughput);
					console.log("throughput = "+throughput);

					phase.throughput = throughput;
					// ui.helper.start = newStartMl;
					// phase.start = newStartMl;
					configurator.updateScales();
					// update();
					var newStartPx = convertMilliliterToPixel(phase.start);
					ui.position.left = newStartPx;
				}
			},
		}).css("position", "absolute");
		$(".phase").click((function(event) {
			dialogConfigurator = this;
			selectedPhase = getPhaseFromHtmlElement(event.currentTarget);
			$( "#dialog-phase" ).dialog( "open" ).bind(this);
		}).bind(this));
		// $(".phase").click((function(event) {
		// 	dialogConfigurator = this;
		// 	selectedPhase = getPhaseFromHtmlElement(this);
		// 	$( "#dialog-phase" ).dialog( "open" );
		// }).bind(this));
		// $( ".phase" ).on('click', function() {
		// 	dialogConfigurator = RecipeConfigurator.this;
		// 	selectedPhase = getPhaseFromHtmlElement(this);
		// 	$( "#dialog-phase" ).dialog( "open" );
		// });
		$( ".phase" ).hover(function() {
				if (dragObject == null) {
					$(this).find('.phase-controls').show();
				}
		}, function() {
				if (dragObject == null) {
					$(this).find('.phase-controls').hide();
				}
		});

		this.splitPhase = function() {
			var phase = selectedPhase;
			var ml = parseInt(splitml.value);
			this.splitPhase2(phase, ml);
		}

		this.splitPhase2 = function(phase, ml) {
			console.log("Should split "+ml+" ml from phase id "+phase.id);
			var sequence = phase.sequence;
			sequence.splitPhase(phase, ml);
			this.render();
			dialogPhase.dialog( "close" );
		}

		function deletePhase() {
			var phase = selectedPhase;
			this.deletePhase2(phase);
		}
		
		function deletePhase2(phase) {
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
				render();
				dialogPhase.dialog( "close" );
			} else {
				// error
			}
		}

		this.addIngredient = function() {
			var ml = parseInt(addml.value);
			var ingredientId = $("#dialog-add-ingredient input[name=ingredientId]").val();
			var ingredient = getIngredientById(ingredientId);
			if (ml > 0) {
				var sequence = new Sequence(ingredient);
				sequence.addPhase(new Phase(0, ml, 100));
				this.recipe.addSequence(sequence);
				this.render();
				dialogAddIngredient.dialog( "close" );
			}
		}
	}
}
	
