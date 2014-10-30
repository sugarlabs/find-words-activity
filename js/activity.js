define(function (require) {
    var activity = require("sugar-web/activity/activity");
    var icon = require("sugar-web/graphics/icon");

    var dictstore = require("sugar-web/dictstore");

    require("easel");
    require("wordfind");
    require("tween");
    require("CSSPlugin");
    require("sound");
    require("wordlist");

    var soundInstance;
    var soundLoaded = false;

    // Manipulate the DOM only when it is ready.
    require(['domReady!'], function (doc) {

        // Initialize the activity.
        activity.setup();

        // HERE GO YOUR CODE

        // initialize canvas size

        var is_xo = ((window.innerWidth == 1200) && (window.innerHeight == 900));
        var sugarCellSize = 75;
        var sugarSubCellSize = 15;
        if (!is_xo) {
            sugarCellSize = 55;
            sugarSubCellSize = 11;
        };

        var wordListCanvas = document.getElementById("wordListCanvas");
        wordListCanvas.height = window.innerHeight - sugarCellSize;
        wordListCanvas.width = window.innerWidth / 3;

        var gameCanvas = document.getElementById("gameCanvas");

        // load the sound
        var soundSrc = "sounds/card.ogg";
        createjs.Sound.alternateExtensions = ["mp3"];
        createjs.Sound.addEventListener("fileload", soundReady);
        createjs.Sound.registerSound(soundSrc);
        soundInstance = createjs.Sound.createInstance(soundSrc);

        function soundReady(event) {
            console.log('Sound loaded');
            soundLoaded = true;
        };

        // game logic

        function Game(wordListCanvas, gameCanvas, startGameButton) {

            this.words = [];
            this.level = 'easy';
            this.found = [];
            this.started = false;
            this.lowerCase = false;
            this.colors = ['#e51c23', '#e91e63', '#9c27b0', '#673ab7',
                           '#3f51b5', '#5677fc', '#03a9f4', '#00bcd4',
                           '#009688', '#259b24', '#8bc34a', '#cddc39',
                           '#ffc107', '#ff9800', '#ff5722'];
            this.audioEnabled = true;

            this.wordListView = new wordlist.View(wordListCanvas, this);
            this.matrixView = new MatrixView(gameCanvas, this);
            this.startGameButton = startGameButton;

            this.setLowerCase = function (lowerCase) {
                this.lowerCase = lowerCase;
                this.wordListView.changeCase();
                if (this.started) {
                    // change the matrix
                    this.matrixView.changeCase();
                };
            };

            this.enableAudio = function (enable) {
                this.audioEnabled = enable;
            };

            this.addWords = function (words) {
                console.log('addWords ' + words.toString());
                var wordsAdded = [];
                for (var n = 0; n < words.length; n++) {
                    if (this.words.indexOf(words[n]) == -1) {
                        this.words.push(words[n]);
                        wordsAdded.push(words[n]);
                    };
                };
                this.wordListView.addWords(wordsAdded);
                this.startGameButton.disabled = false;
            };

            this.addFoundWord = function (word) {
                this.found.push(word);
                this.wordListView.markFound(word);
            };

            this.restartWordList = function() {
                this.wordListView.unmarkAll();
            };

            this.getWordColor = function(word, alpha) {
                var color = createjs.Graphics.getRGB(0xcccccc, alpha);
                var index = this.words.indexOf(word);
                if (index < this.colors.length) {
                    var hexa_color = this.colors[index];
                    r = parseInt(hexa_color.substr(1, 2), 16);
                    g = parseInt(hexa_color.substr(3, 2), 16);
                    b = parseInt(hexa_color.substr(5, 2), 16);
                    color = createjs.Graphics.getRGB(r, g, b, alpha);
                };
                return color;
            };

            this.start = function() {
                this.started = true;
                this.wordListView.gameStarted();
            };

            this.stop = function() {
                if (this.started) {
                    this.started = false;
                } else {
                    // stop the animation
                    this.matrixView.stop();
                };
                this.found = [];
                this.restartWordList();
            };

            this.removeWord = function(word) {
                if (this.words.indexOf(word) > -1) {
                    this.words.splice(this.words.indexOf(word), 1);
                    localStorage["word-list"] = JSON.stringify(this.words);
                    dictstore.save();
                };
                if (this.words.length == 0) {
                    this.startGameButton.disabled = true;
                };
            };

        };


        function MatrixView(canvas, game) {

            this.canvas = canvas;
            this.game = game;

            this.stage = new createjs.Stage(canvas);
            // Enable touch interactions if supported on the current device
            createjs.Touch.enable(this.stage);
            this.stage.mouseChildren = false;

            this.cell_size = 60;
            this.margin_y = 40;

            this.start_cell = null;
            this.end_cell = null;
            this.select_word_line = null;

            this.container;
            this.letters = [];
            this.animation_runnning = false;

            this.init = function () {
                var orientations;
                if (this.game.level == 'easy') {
                    orientations = ['horizontal', 'vertical'];
                };
                if (this.game.level == 'medium') {
                    orientations = ['horizontal', 'vertical', 'diagonal'];
                };
                if (this.game.level == 'hard') {
                    orientations = ['horizontal', 'vertical', 'diagonal',
                                    'horizontalBack', 'verticalUp',
                                    'diagonalUp', 'diagonalBack',
                                    'diagonalUpBack'];
                };

                this.puzzleGame = wordfind.newPuzzle(this.game.words,
                                            {height: 12, width:12,
                                             orientations: orientations,
                                             fillBlanks: true});

                this.puzzle = this.puzzleGame.matrix;
                this.wordLocations = this.puzzleGame.locations;

                // to debug, show the matrix in the console
                wordfind.print(this.puzzle);

                // calculate the end of every word
                for (var n = 0; n < this.wordLocations.length; n++) {
                    var word = this.wordLocations[n];
                    var nextFn = wordfind.orientations[word.orientation];
                    var word_end = nextFn(word.x, word.y, word.word.length - 1);
                    word.end_x = word_end.x;
                    word.end_y = word_end.y;
                };
                // clean objects if the canvas was already used
                this.stage.removeAllChildren();
                this.stage.update();
                this.startup_animation();
            };

            this.startup_animation = function () {
                this.animation_runnning = true;
                // create boxes with letters for every row
                this.boxes = []
                for (var i = 0, height = this.puzzle.length; i < height; i++) {
                    var row = this.puzzle[i];
                    var y = 0;

                    var bar = new createjs.Container();
                    bar.x = 0;
                    bar.y = 0;

                    for (var j = 0, width = row.length; j < width; j++) {
                        var v_box = new createjs.Shape();
                        v_box.graphics.beginStroke("#000000").beginFill(
                            "#eeeeee").drawRect(this.cell_size * j, 0,
                                                this.cell_size, this.cell_size);
                        bar.addChild(v_box);

                        var letter = this.puzzle[i][j];
                        if (this.game.lowerCase) {
                            letter = letter.toLowerCase();
                        } else {
                            letter = letter.toUpperCase();
                        };
                        var text = new createjs.Text(letter,
                                                 "24px Arial", "#000000");
                        text.x = this.cell_size * j + this.cell_size / 2;
                        text.y = y + this.cell_size / 3;
                        text.textAlign = "center";
                        bar.addChild(text);
                    };
                    bar.cache(0, 0, this.cell_size * row.length, this.cell_size);

                    this.boxes.push(bar);
                    this.stage.addChild(bar);
                };

                createjs.Ticker.setFPS(10);
                createjs.Ticker.addEventListener("tick", this.stage);

                if (soundLoaded && this.game.audioEnabled) {
                    soundInstance.play();
                };

                // startup the animation
                createjs.Tween.get(this.boxes.pop()).to(
                    {y:this.cell_size * this.boxes.length + this.margin_y}, 1000,
                    createjs.Ease.bounceOut).wait(300).call(
                    this.animateNextBox, [], this);

            };

            this.animateNextBox = function () {
                if (!this.animation_runnning) {
                    this.stage.removeAllChildren();
                    this.stage.update();
                    return;
                };
                if (this.boxes.length > 0) {
                    if (soundLoaded && this.game.audioEnabled) {
                        soundInstance.stop();
                        soundInstance.play();
                    };
                    createjs.Tween.get(this.boxes.pop()).to(
                        {y:this.cell_size * this.boxes.length + this.margin_y},
                        1000,
                        createjs.Ease.bounceOut).wait(300).call(
                        this.animateNextBox, [], this);
                } else {
                    if (soundLoaded && this.game.audioEnabled) {
                        soundInstance.stop();
                    };
                    this.stage.removeAllChildren();
                    this.startGame();
                };
            };

            this.getCell = function (x, y) {
                var cell_x = parseInt(x / this.cell_size);
                var cell_y = parseInt((y - this.margin_y) / this.cell_size);
                return [cell_x, cell_y];
            };

            this.startGame = function() {

                this.select_word_line = new createjs.Shape();

                this.container = new createjs.Container();
                this.container.x = 0;
                this.container.y = this.margin_y;

                // need a white background to receive the mouse events
                var background = new createjs.Shape();
                background.graphics.beginFill(
                    "#ffffff").drawRect(
                    0, 0,
                    this.cell_size * this.puzzle.length,
                    this.cell_size * this.puzzle.length);
                this.container.addChild(background);

                var letters = [];
                for (var i = 0, height = this.puzzle.length; i < height; i++) {
                    var row = this.puzzle[i];
                    var y = this.cell_size * i;

                    for (var j = 0, width = row.length; j < width; j++) {
                        var letter = this.puzzle[i][j];
                        if (this.game.lowerCase) {
                            letter = letter.toLowerCase();
                        } else {
                            letter = letter.toUpperCase();
                        };
                        var text = new createjs.Text(letter,
                                                 "24px Arial", "#000000");
                        text.x = this.cell_size * j + this.cell_size / 2;
                        text.y = y + this.cell_size / 3;
                        text.textAlign = "center";
                        this.container.addChild(text);
                        this.letters.push(text);
                    };
                };
                this.container.cache(0, 0, this.cell_size * this.puzzle.length,
                                this.cell_size * this.puzzle.length);
                this.stage.addChild(this.container);

                this.stage.addChild(this.select_word_line);

                this.stage.update();

                this.game.start();
            };

            this.stop = function() {
                // stop the animation
                this.animation_runnning = false;
            };

            this.changeCase = function () {
                for (var i = 0; i < this.letters.length; i++) {
                    var letter = this.letters[i];
                    if (this.game.lowerCase) {
                        letter.text = letter.text.toLowerCase();
                    } else {
                        letter.text = letter.text.toUpperCase();
                    };
                };
                this.container.updateCache();
            };

            this.stage.on("pressup", function (event) {
                this.verifyWord(this.start_cell, this.end_cell);
                this.start_cell = null;
                this.end_cell = null;
            }, this);

            this.stage.on('click', function (event) {
                if (this.animation_runnning) {
                    // empty the list with the falling blocks
                    // to end the animation
                    this.boxes = [];
                };
            }, this);

            this.stage.on("pressmove", function (event) {
                if (!this.game.started) {
                    return;
                };

                if (this.start_cell == null) {
                    var cell = this.getCell(event.stageX, event.stageY);
                    this.start_cell = [cell[0], cell[1]];
                    this.end_cell = null;
                    return;
                };

                var end_cell = this.getCell(event.stageX, event.stageY);
                if (this.end_cell != null &&
                    (end_cell[0] == this.end_cell[0]) &&
                    (end_cell[1] == this.end_cell[1])) {
                    return;
                };
                this.end_cell = end_cell;
                this.select_word_line.graphics.clear();
                var color = createjs.Graphics.getRGB(0xe0e0e0, 1.0);
                this.markWord(this.start_cell, this.end_cell,
                              this.select_word_line, color);

                // move the select word line to the top
                var topIndex = this.stage.getNumChildren() - 1;
                var selectWordIndex = this.stage.getChildIndex(
                    this.select_word_line);
                if (topIndex != selectWordIndex) {
                    this.stage.swapChildrenAt(topIndex, selectWordIndex);
                };
                this.stage.update();
            }, this);

            this.verifyWord = function(start_cell, end_cell) {
                if ((start_cell == null) || (end_cell == null)) {
                    return;
                };
                for (var n = 0; n < this.wordLocations.length; n++) {
                    var word = this.wordLocations[n];
                    var nextFn = wordfind.orientations[word.orientation];
                    var end_word = nextFn(start_cell[0], start_cell[1],
                                          word.word.length - 1);
                    if ((word.x == start_cell[0] && word.y == start_cell[1] &&
                         word.end_x == end_cell[0] &&
                         word.end_y == end_cell[1]) ||
                        (word.end_x == start_cell[0] &&
                         word.end_y == start_cell[1] &&
                         word.x == end_cell[0] && word.y == end_cell[1])) {
                        // verify if was already marked
                        if (this.game.found.indexOf(word.word) > -1) {
                            continue;
                        };

                        var color = this.game.getWordColor(word.word, 1);
                        var found_word_line = new createjs.Shape();
                        this.markWord(start_cell, end_cell,
                                      found_word_line, color);

                        found_word_line.mouseEnabled = false;
                        this.stage.addChild(found_word_line);

                        // show in the word list
                        this.game.addFoundWord(word.word);

                    };
                };
                this.select_word_line.graphics.clear();
                this.stage.update();
            };

            /*
            Draw a rounded rectangle over shape
            star_cell, end_cell = array of integer
            shape = createjs.Shape
            color = createjs.Graphics.getRGB
            */
            this.markWord = function(start_cell, end_cell, shape, color) {

                var start_cell_x = start_cell[0];
                var start_cell_y = start_cell[1];

                var end_cell_x = end_cell[0];
                var end_cell_y = end_cell[1];

                var x1 = start_cell_x * this.cell_size + this.cell_size / 2;
                var y1 = this.margin_y + start_cell_y * this.cell_size +
                    this.cell_size / 2;
                var x2 = end_cell_x * this.cell_size + this.cell_size / 2;
                var y2 = this.margin_y + end_cell_y * this.cell_size +
                    this.cell_size / 2;

                var diff_x = x2 - x1;
                var diff_y = y2 - y1;
                var angle_rad = Math.atan2(diff_y, diff_x);
                var angle_deg = angle_rad * 180 / Math.PI;
                var distance = diff_x / Math.cos(angle_rad);
                if (Math.abs(angle_deg) == 90) {
                    distance = Math.abs(diff_y);
                };

                var line_width = this.cell_size / 10;
                shape.graphics.setStrokeStyle(line_width, "round");
                shape.graphics.beginStroke(color);
                shape.graphics.drawRoundRect(
                    -(this.cell_size - line_width) / 2,
                    -(this.cell_size - line_width) / 2,
                    distance + this.cell_size - line_width,
                    this.cell_size - line_width,
                    this.cell_size / 2);
                shape.graphics.endStroke();
                shape.rotation = angle_deg;
                shape.x = x1;
                shape.y = y1;
            };

        };

        var startGameButton = document.getElementById("start-game-button");
        var game = new Game(wordListCanvas, gameCanvas, startGameButton);

        // toolbar
        var upperLowerButton = document.getElementById("upperlower-button");
        upperLowerButton.onclick = function () {
            this.classList.toggle('active');
            var lowercase = this.classList.contains('active');
            game.setLowerCase(lowercase);
        };

        var backButton = document.getElementById("back-button");
        backButton.addEventListener('click', function (e) {
            document.getElementById("firstPage").style.display = "block";
            document.getElementById("gameCanvas").style.display = "none";
            game.stop();
        });

        var audioButton = document.getElementById("audio-button");
        audioButton.onclick = function () {
            this.classList.toggle('active');
            var enable = !this.classList.contains('active');
            game.enableAudio(enable);
            localStorage["audio-enabled"] = enable;
            dictstore.save();
        };

        // datastore
        var wordList = [];

        function onStoreReady() {
            if (localStorage["word-list"]) {
                var jsonData = localStorage["word-list"];
                var wordList = JSON.parse(jsonData);
                game.addWords(wordList);
                setLevel(localStorage["level"]);
                game.enableAudio(localStorage["audio-enabled"] == 'true');
                if (!game.audioEnabled){
                    audioButton.classList.toggle('active');
                };
            };
        };

        dictstore.init(onStoreReady);

        startGameButton.addEventListener('click', function (e) {
            document.getElementById("firstPage").style.display = "none";
            document.getElementById("gameCanvas").style.display = "block";
            game.matrixView.init();
        });

        // not allow input special characters, number or spaces in the words
        var iChars = "0123456789!¡~@#$%^&*()+=-[]\\\';,./{}|\":<>?¿ ";

        var wordInput = document.getElementById("word-input");
        var errorArea = document.getElementById("validation-error");
        var addWordButton = document.getElementById("add-word-button");

        createjs.CSSPlugin.install(createjs.Tween);
        createjs.Ticker.setFPS(20);

        addWordButton.addEventListener('click', function (e) {
            addWord();
        });

        wordInput.addEventListener('keypress', function (e) {
            hideError();
            if (e.which == 13) {
                addWord();
            };
        });

        function validateWord(word) {
            if (word.length < 3) {
                showError('Must be at least 3 letters');
                return false;
            };
            for (var i = 0; i < word.length; i++) {
                if (iChars.indexOf(word.charAt(i)) > -1) {
                    showError('Remove all punctuation');
                    return false;
                };
            };
            hideError();
            return true;
        };

        function showError(msg) {
            var buttonPos = findPosition(addWordButton);
            console.log('POSITION ' + buttonPos.left + ' ' + buttonPos.top);
            errorArea.innerHTML = '<div id="validation-error-msg">' + msg +
                '</div>';
            errorArea.style.left = buttonPos.left + 'px';
            errorArea.style.top = buttonPos.top + 'px';
            errorArea.style.opacity = "0.1";
            errorArea.style.display = "block";

            createjs.Tween.get(errorArea).set({opacity:"1.0"},
                               errorArea.style, 3000);

        };

        function hideError() {
            errorArea.style.display = "none";
        };

        function findPosition(obj) {
            var left = 0;
            var top = 0;
            if (obj.offsetParent) {
                while(1) {
                    left += obj.offsetLeft;
                    top += obj.offsetTop;
                    if(!obj.offsetParent)
                        break;
                    obj = obj.offsetParent;
                };
            } else if(obj.x) {
                left += obj.x;
                top += obj.y;
            };
            return {left:left, top: top};
        };

        function addWord() {
            if (!validateWord(wordInput.value)) {
                return;
            };
            game.addWords([wordInput.value.toUpperCase()]);
            wordInput.value = '';
            wordInput.focus();
            // save in the journal
            localStorage["word-list"] = JSON.stringify(game.words);
            dictstore.save();
        };

        // level buttons
        var easyButton = document.getElementById("easy-button");
        var mediumButton = document.getElementById("medium-button");
        var hardButton = document.getElementById("hard-button");

        function getButton(level) {
            var button;
            if (level == 'easy') {
                console.log('LEVEL EASY');
                button = easyButton;
            } else if (level == 'medium') {
                console.log('LEVEL MEDIUM');
                button = mediumButton;
            } else if (level == 'hard') {
                console.log('LEVEL HARD');
                button = hardButton;
            };
            return button;
        }

        function setLevel(level) {

            console.log('setLevel ' + game.level + ' new level ' + level);
            var originalButton = getButton(game.level);
            var button = getButton(level);
            game.level = level;

            if (localStorage["level"] != level) {
                localStorage["level"] = level;
                dictstore.save();
            };

            var initSize = sugarSubCellSize * 6;
            console.log('button ' + button + ' width ' + initSize);
            createjs.Tween.get(button).set(
                {webkitTransform: "rotate(30deg)"}, button.style, 500).wait(100).set(
                {webkitTransform: "rotate(0deg)"}, button.style, 500).wait(100).set(
                {webkitTransform: "rotate(-30deg)"}, button.style, 500).wait(100).set(
                {webkitTransform: "rotate(0deg)"}, button.style, 500).wait(100).set(
                {width: String(initSize * 1.5) +"px",
                 height: String(initSize * 1.5) +"px"}, button.style, 1500).wait(200).set(
                {width: String(initSize * 1.25) +"px",
                 height: String(initSize * 1.25) +"px"}, button.style, 1000);

            createjs.Tween.get(originalButton).set(
                {width: String(initSize) +"px",
                 height: String(initSize) +"px"}, originalButton.style, 1000);
        };

        easyButton.addEventListener('click', function (e) {
            setLevel('easy');
        });

        mediumButton.addEventListener('click', function (e) {
            setLevel('medium');
        });

        hardButton.addEventListener('click', function (e) {
            setLevel('hard');
        });

    });

});
