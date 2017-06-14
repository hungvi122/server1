var express = require('express');
var app     = express();
var http    = require('http').Server(app);
var io      = require('socket.io')(http);
var util 	= require('./util.js');
var c  = require('./config.json');
var SAT = require('sat');
var V = SAT.Vector;
var C = SAT.Circle;

var port = process.env.PORT;
app.get('/', function (req, res) {
  res.send('hello world ' + port);
})
var users = [];
var massFood = [];
var minFood = [];
var enemies = [];
var airBubbles = [];
var booms = [];
var jellyFishs = [];
var virus = [];
var food = [];
var sockets = {};
var bots = [];
var leaderboard = [];
var leaderboardChanged = false;

var initMassLog = util.log(c.defaultPlayerMass, c.slowBase);

function addAIBot(toAdd){

    var radius = c.fishType["0"].radius;
    var massTotal = 0;
   while (toAdd--){
    var position = {
        x : util.randomInRange(0, c.gameWidth),
        y : util.randomInRange(0, c.gameHeight),
    };
    bots.push({
        id: ((new Date()).getTime() + '' + bots.length) >>> 0,
        deg: 0,
        name: "bot-" + bots.length + util.randomInRange(1, 100),
        x: position.x,
        y: position.y,
        numberBoom: 0,
        radius: radius,
        speed: c.speedPlayer,
        speedAnimation: 0,
        frameAnimation: 0,
        width: c.fishType["0"].width,
        height: c.fishType["0"].height,
        column: c.fishType["0"].column,
        row: c.fishType["0"].row,
        massTotal: massTotal,
        hue: Math.round(Math.random() * 360),
        type: c.typeObj.AIBOT,
        lastHeartbeat: new Date().getTime(),
        target: {
            x: 0,
            y: 0
        },
        isHut: false,
        direction: c.direct.LEFT,
        timeAcceleration: {status: true, timeClick: 0},
        timeSpeed: {status: true, timeClick: 0},
        jellyCollision: {
                status: false,
                time: 0
        },
        levelUp: {
            status: true,
            time: new Date().getTime(),
            level: 0,
            targetMass: c.fishType[0].maxMass
        },
        strategy:{
            status: c.BOT.SAVE,
            bot: {
                lstSave: [],
                lstWarn: [],
                lstDanger:[],
                lstAttack:[]
            },
            user: {
                lstSave: [],
                lstWarn: [],
                lstDanger:[],
                lstAttack:[]
            }
        },
        living: {
            status: true,
            time: 0
        }
    });
   } 
}
function findEnemyToEat(bot){
    bot.strategy.bot.lstDanger = [];
    bot.strategy.bot.lstWarn = [];
    bot.strategy.bot.lstSave = [];
    bot.strategy.bot.lstAttack = [];
    bot.strategy.user.lstAttack = [];
    bot.strategy.user.lstDanger = [];
    bot.strategy.user.lstWarn = [];
    bot.strategy.user.lstSave = [];
    var ereaDanger = new SAT.Circle(new SAT.Vector(bot.x, bot.y), 200);
    var ereaWarn = new SAT.Circle(new SAT.Vector(bot.x, bot.y), 400);

    var point ;
    for (var i = 0; i < users.length; i++) {
        point = new SAT.Vector(users[i].x, users[i].y);
        if(SAT.pointInCircle(point, ereaDanger)){
            if(bot.levelUp.level < users[i].levelUp.level)
                bot.strategy.user.lstDanger.push(users[i].id);
            else if(bot.levelUp.level > users[i].levelUp.level)
                bot.strategy.user.lstAttack.push(users[i].id);
        }

        if(SAT.pointInCircle(point, ereaWarn)){
            if(bot.levelUp.level <= users[i].levelUp.level)
                bot.strategy.user.lstWarn.push(users[i].id);
            else if(bot.levelUp.level > users[i].levelUp.level)
                bot.strategy.user.lstSave.push(users[i].id);
        }
    }

    for (var i = 0; i < bots.length; i++) {
        if(bot.id == bots[i].id)
            continue;
        point = new SAT.Vector(bots[i].x, bots[i].y);
        if(SAT.pointInCircle(point, ereaDanger)){
            if(bot.levelUp.level < bots[i].levelUp.level)
                bot.strategy.bot.lstDanger.push(bots[i].id);
            else if(bot.levelUp.level > bots[i].levelUp.level)
                bot.strategy.bot.lstAttack.push(bots[i].id);
        }

        if(SAT.pointInCircle(point, ereaWarn)){
            if(bot.levelUp.level <= bots[i].levelUp.level)
                bot.strategy.bot.lstWarn.push(bots[i].id);
            else if(bot.levelUp.level > bots[i].levelUp.level)
                bot.strategy.bot.lstSave.push(bots[i].id);
        }
    }

    if(bot.strategy.bot.lstDanger.length  + bot.strategy.user.lstDanger.length > 0){
        bot.strategy.status = c.BOT.DANGER;
    }else if(bot.strategy.bot.lstAttack.length  + bot.strategy.user.lstAttack.length > 0){
        bot.strategy.status = c.BOT.ATTACK;
    }else if(bot.strategy.bot.lstWarn.length  + bot.strategy.user.lstWarn.length > 0){
        bot.strategy.status = c.BOT.WARN;
    }else
        bot.strategy.status = c.BOT.SAVE;
}

function FindBestDirection(pos, lsEnemy){    
    var lstDeg = [];
    for (var i = 0; i < lsEnemy.length; i++) {
        var degTemp = Math.atan2(lsEnemy[i].y - pos.y, lsEnemy[i].x - pos.x);
        lstDeg.push(degTemp);
    }
    if(pos.x < 50){
        lstDeg.push(Math.PI);
    }
    if(pos.y < 50){
        lstDeg.push(Math.PI/2);
    }
    if(pos.x > c.gameWidth - 50){
        lstDeg.push(0);
    }
    if(pos.y > c.gameHeight - 50){
        lstDeg.push(-Math.PI/2);
    }
    
    lstDeg.sort( function(a, b) { return a - b; });
    var degMax = Math.PI * 2 + lstDeg[0] - lstDeg[lstDeg.length -1];
    var index = 0;

    for (var i = 1; i < lstDeg.length; i++) {
        var subDeg = lstDeg[i] - lstDeg[i-1];
        if(degMax < subDeg){
            degMax = subDeg;
            index = i;
        }
    }
    var deg = lstDeg[(index -1 + lstDeg.length) %lstDeg.length] + degMax/2;
    return deg;
}
function GetLst(bot, name){
    var lstEnemy = [];
    for (var i = 0; i < bot.strategy.user[name].length; i++) {
        var index = util.findIndex(users, bot.strategy.user[name][i]);
        if( index != -1){
            lstEnemy.push({
                x: users[index].x,
                y: users[index].y
            });
        }
    }

    for (var i = 0; i < bot.strategy.bot[name].length; i++) {
        if(bot.strategy.bot[name].id == bot.id)
            continue;
        var index = util.findIndex(bots, bot.strategy.bot[name][i]);
        if( index != -1){
            lstEnemy.push({
                x: bots[index].x,
                y: bots[index].y
            });
        }
    }
    return lstEnemy;
}
function FindDirectionForBot(bot){
    if(bot.strategy.status == c.BOT.DANGER){
        var lstEnemy = GetLst(bot, "lstDanger");
        bot.deg = FindBestDirection(bot, lstEnemy);
        bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
        mouseLeft(bot);
        if(bot.numberBoom > 0){
            console.log("BOOM");
            addBoom(bot);
        }
    }else if(bot.strategy.status == c.BOT.ATTACK){
        //chay
        var lstAttack = GetLst(bot, "lstAttack");
         point = util.getMinPoint(bot, lstAttack);
        console.log("lstAttack",lstAttack);
        bot.deg = Math.atan2(point.y - bot.y, point.x - bot.x);
        bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
        mouseRight(bot);
        mouseLeft(bot);
    }else if(bot.strategy.status == c.BOT.WARN){
        //chay
        var lstWarn = GetLst(bot, "lstWarn");
        bot.deg = FindBestDirection(bot, lstWarn);
        bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
        // mouseLeft(bot);
    }else {
        //find target to attack
        var lstSave = GetLst(bot, "lstSave");
        if(lstSave.length != 0){
            var point = util.getMinPoint(bot, lstSave);
            bot.deg = Math.atan2(point.y - bot.y, point.x - bot.x);
            bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
        }else{
            var point = util.getMinPoint(bot, virus);
            if(util.getDistance(bot, point) < 200){
                bot.deg = Math.atan2(point.y - bot.y, point.x - bot.x);
                bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
            }else{
                point = util.getMinPoint(bot, food);
                bot.deg = Math.atan2(point.y - bot.y, point.x - bot.x); 
                bot.direction = (Math.abs(bot.deg) > Math.PI/2)? c.direct.LEFT: c.direct.RIGHT;
            }
        } 
    }
}

function addJellyFish(toAdd) {
    var i = util.randomInRange(0, c.jellyFish.typeMax);
    while (toAdd--) {
        jellyFishs.push({
            // Make IDs unique.
            id: ((new Date()).getTime() + '' + jellyFishs.length) >>> 0,
            x: util.randomInRange(0, c.gameWidth),
            y: c.gameHeight + util.randomInRange(0, c.gameWidth)* 0.2,
            width: c.jellyFish.width,
            height: c.jellyFish.height,
            target: {
                x : 0,
                y : 0,
            },
            speedAnimation: 0,
            frameAnimation: 0,
            column: c.jellyFish.column,
            row: c.jellyFish.row,
            isHut: false,
            type: c.typeObj.JELLY,
            level: i
        });
    }
}

function addAirBubble(toAdd) {
    while (toAdd--) {
        airBubbles.push({
            // Make IDs unique.
            id: ((new Date()).getTime() + '' + airBubbles.length) >>> 0,
            x: util.randomInRange(0, c.gameWidth),
            y: c.gameHeight + util.randomInRange(0, c.gameWidth)* 0.2,
            target: {
                x : 0,
                y : util.randomInRange(0, c.gameHeight)
            },
            type: c.typeObj.AIR,
            level: util.randomInRange(0, c.airBubble.typeMax -1)
        });
    }
}

function addMinFood(toAdd) {
    while (toAdd--) {
        minFood.push({
            // Make IDs unique.
            id: ((new Date()).getTime() + '' + minFood.length) >>> 0,
            x: Math.floor(Math.random()* c.gameWidth * 0.8),
            y: Math.floor(Math.random()* c.gameHeight* 0.8),
            choose: false,
            timeOut: 0
        });
    }
}
function addFood(toAdd) {
    var size = c.food.level.length;
    var i = util.randomLevelFood(size);
    
    var radius = c.food.level[i].radius;
    while (toAdd--) {
        var position = c.foodUniformDisposition ? 
        util.uniformPosition(food, radius) 
        : util.randomPosition(radius);
        food.push({
            // Make IDs unique.
            id: ((new Date()).getTime() + '' + food.length) >>> 0,
            x: position.x,
            y: position.y,
            direction: c.direct.LEFT,
            target: {
                x: Math.floor(Math.random()* c.gameWidth * 0.8),
                y: Math.floor(Math.random()* c.gameHeight* 0.8)
            },
            radius: c.food.level[i].radius,
            mass: c.food.level[i].foodMass,
            speedAnimation: 0,
            frameAnimation: 0,
            column: c.food.level[i].column,
            row: c.food.level[i].row,
            isHut: false,
            type: c.typeObj.FOOD,
            level: i,
            jellyCollision: {
                status: false,
                time: 0
            }
        });
    }
}

function addBoom(player) {
    player.numberBoom --;
    var radius = c.virus.radius;
    booms.push({
        id: ((new Date()).getTime() + '' + booms.length) >>> 0,
        playerId: player.id,
        time: (new Date()).getTime(),
        x: player.x,
        y: player.y,
        radius: radius,
        frameAnimation: 0,
        type: c.typeObj.VIRUS,
        status: c.virus.status.LIVE
    });
}

function addEnemy(toAdd) {
     while (toAdd--) {
        var radius = c.virus.radius;
        var i = util.randomInRange(0, users.length);
        enemies.push({
            id: ((new Date()).getTime() + '' + enemies.length) >>> 0,
            idTarget: users[i].id,
            time: (new Date()).getTime(),
            x: util.randomInRange(0, c.gameWidth),
            y: c.gameHeight + util.randomInRange(0, c.gameWidth)* 0.2,
            target :{
                x: users[i].x,
                y: users[i].y
            },
            height: c.sharkFish.level[0].height,
            width: c.sharkFish.level[0].width,
            speed: c.sharkFish.level[0].speed,
            radius: radius,
            column: c.sharkFish.level[0].column,
            row: c.sharkFish.level[0].row,
            direction: c.direct.RIGHT,
            animation: {
                status: false,
                time: 0
            },
            isHut: false,
            speedAnimation: 0,
            frameAnimation: 0,
            type: c.typeObj.ENEMY,
            jellyCollision: {
                status: false,
                time: 0
            },
            eatFish:{
                status: false,
                time: 0
            }
        });
    }
}

function addVirus(toAdd) {
    while (toAdd--) {
        var radius = c.virus.radius;
        var position = c.virusUniformDisposition ? util.uniformPosition(virus, radius) : util.randomPosition(radius);
        virus.push({
            id: ((new Date()).getTime() + '' + virus.length) >>> 0,
            x: position.x,
            y: c.gameHeight +  util.randomInRange(50, 50 + c.gameWidth/10),
            target :{
                x: position.x,
                y: 0
            },
            radius: radius,
            speedAnimation: 0,
            frameAnimation: 0,
            type: c.typeObj.VIRUS,
            status: c.virus.status.LIVE
        });
    }
}

function getTypeFish(mass){
    for (var i = 0; i < c.fishType.length; i++) {
        if(c.fishType[i].maxMass > mass)
            return i;
    }
    return c.fishType.length - 1;
}

function movePlayer(player) {
   
    if(player.isHut == true){
        var deg = Math.atan2(player.target.y, player.target.x);

        var slowDown = 1;
        if(player.speed <= 6.25) {
           slowDown = util.log(20, c.slowBase) + initMassLog;
        }
       deltaY = player.speed * Math.sin(deg)/slowDown;
       deltaX = player.speed * Math.cos(deg)/slowDown;
        
        player.y += deltaY;
        player.x += deltaX;
        player.speed -= 0.5;
        if(player.speed < 0) {
            player.isHut = false;
        }
        return;
    }

    if(player.jellyCollision.status == true){
        return;
    }
    var deg, dist;
    if(player.type == c.typeObj.AIBOT){
        deg = player.deg;
        //console.log(deg);
    }
    else{
    var target = player.target;
    if(target.x == 0 && target.y == 0){
        return;
    }
    dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
    deg = Math.atan2(target.y, target.x);
    }
    var slowDown = 1;
    if(player.speed <= 6.25) {
        slowDown =  initMassLog + 1;
    }

    var deltaY = player.speed * Math.sin(deg)/ slowDown;
    var deltaX = player.speed * Math.cos(deg)/ slowDown;

    if(player.speed > 6.25) {
        player.speed -= 0.5;
    }
    if (dist < (50 + player.radius)) {
        deltaY *= dist / (50 + player.radius);
        deltaX *= dist / (50 + player.radius);
    }
    if (!isNaN(deltaY)) {
        player.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        player.x += deltaX;
    }
 
    var borderCalc = player.radius / 3;
    if (player.x > c.gameWidth - borderCalc) {
        player.x = c.gameWidth - borderCalc;
    }
    if (player.y > c.gameHeight - borderCalc) {
        player.y = c.gameHeight - borderCalc;
    }
    if (player.x < borderCalc) {
        player.x = borderCalc;
    }
    if (player.y < borderCalc) {
        player.y = borderCalc;
    }
}
// di chuy?n các d?i th? khác.
function moveFood(mass) {
    if(mass.target == undefined ){
        return;
    }
    var deltaY = 0;
    var deltaX = 0;
    var slowDown = 1;
    if(mass.isHut == true){
        var deg = Math.atan2(mass.target.y, mass.target.x);
       deltaY = mass.speed * Math.sin(deg)/slowDown;
       deltaX = mass.speed * Math.cos(deg)/slowDown;
        
        mass.y += deltaY;
        mass.x += deltaX;
        mass.speed -= 0.5;
        if(mass.speed < 0) {
            mass.isHut = false;
        }
        return;
    }
    if((mass.type == c.typeObj.FOOD || mass.type == c.typeObj.ENEMY ) && mass.jellyCollision.status == true)
        return;
    var deg = Math.atan2(mass.target.y - mass.y, mass.target.x - mass.x);

    if(mass.type == c.typeObj.VIRUS){
        deltaY = -3;
        deltaX = 0;
    }else if(mass.type == c.typeObj.FOOD){
        if(mass.stand != undefined && mass.stand == true)
            return;
        deltaY = c.food.level[mass.level].speed * Math.sin(deg)/slowDown;
        deltaX = c.food.level[mass.level].speed * Math.cos(deg)/slowDown;
    }else if(mass.type == c.typeObj.AIBOT){
        if(mass.stand != undefined && mass.stand == true)
            return;
        deltaY = 6 * Math.sin(deg)/slowDown;
        deltaX = 6 * Math.cos(deg)/slowDown;

    }
    else if(mass.type == c.typeObj.ENEMY ){
        if(mass.stand != undefined && mass.stand == true)
            return;
        deltaY = mass.speed * Math.sin(deg)/slowDown;
        deltaX = mass.speed * Math.cos(deg)/slowDown;
    }else if(mass.type == c.typeObj.AIR){
        deltaY = -5;
        deltaX = 0;
    }else if(mass.type == c.typeObj.JELLY){
        deltaY = -1;
        deltaX = 0;
    }else if(mass.type == c.typeObj.MASS){
        deltaY = mass.speed * Math.sin(deg)/slowDown;
        deltaX = mass.speed * Math.cos(deg)/slowDown;
        mass.speed -= 0.5;
        if(mass.speed < 0){
            mass.speed = 0;
        }
    }
    if(!isNaN(deltaX)  && !isNaN(deltaY)){
        mass.y += deltaY;
        mass.x += deltaX;
    }
    if(mass.type == c.typeObj.JELLY || mass.type == c.typeObj.VIRUS || mass.type == c.typeObj.AIR)
        return;
    var borderCalc = mass.radius / 2;
    if (mass.x > c.gameWidth - borderCalc) {
        mass.x = c.gameWidth - borderCalc;
    }
    if (mass.y > c.gameHeight - borderCalc) {
        mass.y = c.gameHeight - borderCalc;
    }
    if (mass.x < borderCalc) {
        mass.x = borderCalc;
    }
    if (mass.y < borderCalc) {
        mass.y = borderCalc;
    }
}

function balanceMass() {  
    var foodToAdd = c.food.maxFood - food.length;
    if (foodToAdd > 0) {
        console.log('[DEBUG] Adding ' + foodToAdd + ' food to level!');
        addFood(foodToAdd);
    }
    

    var virusToAdd = c.virus.maxVirus - virus.length;

    if (virusToAdd > 0) {
        addVirus(virusToAdd);
    }
    if(c.maxMinFood > minFood.length){
        addMinFood(c.maxMinFood- minFood.length);
    }
    if(c.airBubble.maxAirBubble > airBubbles.length){
        addAirBubble(c.airBubble.maxAirBubble - airBubbles.length);
    }

    if(c.jellyFish.maxJellyFish > jellyFishs.length){
        addJellyFish(c.jellyFish.maxJellyFish - jellyFishs.length);
    }
    if(users.length > 0){
        if(c.sharkFish.maxSharkFish > enemies.length){
            addEnemy(c.sharkFish.maxSharkFish - enemies.length);
        }
    }
    if(c.numberBot > bots.length){
        addAIBot(c.numberBot - bots.length);
    }
}

io.on('connection', function (socket) {
    console.log('A user connected!', socket.handshake.query.type);

    var type = socket.handshake.query.type;
    var radius = c.fishType["0"].radius;
    var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);
    var massTotal = 0;

    var currentPlayer = {
        id: socket.id,
        x: position.x,
        y: position.y,
        numberBoom: 0,
        radius: radius,
        speed: c.speedPlayer,
        speedAnimation: 0,
        frameAnimation: 0,
        width: c.fishType["0"].width,
        height: c.fishType["0"].height,
        column: c.fishType["0"].column,
        row: c.fishType["0"].row,
        massTotal: massTotal,
        kill: 0,
        hue: Math.round(Math.random() * 360),
        type: type,
        lastHeartbeat: new Date().getTime(),
        target: {
            x: 0,
            y: 0
        },
        isHut: false,
        direction: c.direct.LEFT,
        timeAcceleration: {status: true, timeClick: 0},
        timeSpeed: {status: true, timeClick: 0},
        jellyCollision: {
                status: false,
                time: 0
        },
        levelUp: {
            status: true,
            time: new Date().getTime(),
            level: 0,
            targetMass : c.fishType[0].maxMass
        },
        living: {
            status: true,
            time: 0
        }

    };
    socket.on('addBoom',function(){
        console.log("addBoom");
        if(currentPlayer.numberBoom > 0){
            console.log("currentPlayer.id", currentPlayer.id);
            addBoom(currentPlayer);
        }
    });
    socket.on('mouseRight',function(){
        mouseRight(currentPlayer);
    });
    socket.on('mouseLeft',function(){
        mouseLeft(currentPlayer);
    });
    socket.on('gotit', function (player) {
        if (util.findIndex(users, player.id) > -1) {
            console.log('[INFO] Player ID is already connected, kicking.');
            socket.disconnect();
        } else if (!util.validNick(player.name)) {
            socket.emit('kick', 'Invalid username.');
            
            socket.disconnect();
        } else {
            console.log('[INFO] Player ' + player.name + ' connected!');
            sockets[player.id] = socket;

            var radius = c.fishType["0"].radius;
            var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);
            // currentPlayer = {
            //     id: socket.id,
            //     x: position.x,
            //     y: position.y,
            //     numberBoom: 0,
            //     radius: radius,
            //     speed: c.speedPlayer,
            //     speedAnimation: 0,
            //     frameAnimation: 0,
            //     width: c.fishType["0"].width,
            //     height: c.fishType["0"].height,
            //     column: c.fishType["0"].column,
            //     row: c.fishType["0"].row,
            //     massTotal: massTotal,
            //     kill: 0,
            //     hue: Math.round(Math.random() * 360),
            //     type: type,
            //     lastHeartbeat: new Date().getTime(),
            //     target: {
            //         x: 0,
            //         y: 0
            //     },
            //     name: player.name,
            //     isHut: false,
            //     direction: c.direct.LEFT,
            //     timeAcceleration: {status: true, timeClick: 0},
            //     timeSpeed: {status: true, timeClick: 0},
            //     jellyCollision: {
            //             status: false,
            //             time: 0
            //     },
            //     levelUp: {
            //         status: true,
            //         time: new Date().getTime(),
            //         level: 0,
            //         targetMass : c.fishType[0].maxMass
            //     },
            //     living: {
            //         status: true,
            //         time: 0
            //     }
            // };
            currentPlayer = player;
            users.push(currentPlayer);
            console.log("USER: ", users);

            io.emit('playerJoin', { name: currentPlayer.name });
            var temp1 = {
                gameWidth: c.gameWidth,
                gameHeight: c.gameHeight
            }
            socket.emit('gameSetup', temp1);
            console.log('Total players: ' + users.length);
        }

    });

    socket.on('pingcheck', function () {
        socket.emit('pongcheck');
    });

    socket.on('windowResized', function (data) {
        console.log('windowResized', data);
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('respawn', function () {
        console.log('respawn');
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        socket.emit('welcome', currentPlayer);
    });

    socket.on('disconnect', function () {
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        console.log('[INFO1] User ' + currentPlayer.name + ' disconnected!');

        socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
    });
    // Heartbeat function, update everytime.
    socket.on('0', function(target) {
        currentPlayer.lastHeartbeat = new Date().getTime();
        if(currentPlayer.isHut)
            return;
        if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
            currentPlayer.target = target;
            if(target.x > 0)
                currentPlayer.direction = c.direct.RIGHT;
            else if(target.x < 0) currentPlayer.direction = c.direct.LEFT;
        }
    });
});
function mouseLeft(currentPlayer){
    if(!currentPlayer.timeSpeed.status){
            return;
        }
        // console.log("F");
        currentPlayer.timeSpeed.status = false;
        currentPlayer.timeSpeed.timeClick = new Date().getTime();
        currentPlayer.speed = 20;
}
function mouseRight(currentPlayer){
    function HutObject(obj){ 
            if(obj == undefined || obj.id == currentPlayer.id)
                return;
            var distance = util.getDistance(currentPlayer, obj);
            var deg1 = Math.atan2(obj.y, obj.x);
            var deg2 = Math.atan2(currentPlayer.y, currentPlayer.x);
            var sub = deg2 - deg1;

            var deg = Math.atan2(currentPlayer.target.y, currentPlayer.target.x);
            var slowDown = 1;
            deltaY = 0;//currentPlayer.speed * Math.sin(deg)/slowDown;
            deltaX = 0;//currentPlayer.speed * Math.cos(deg)/slowDown;
            var direction2 = (currentPlayer.x < obj.x) ? 1: -1;
            if(distance < c.radiusAbsorb  && (Math.abs(sub) < Math.PI/4) && !(direction2 ^ direction)){
                obj.target = {x: currentPlayer.x + deltaX + direction * currentPlayer.width/2 -obj.x, y :currentPlayer.y + deltaY -obj.y};
                obj.speed = 10;
                obj.isHut = true;
                // if(obj.type == c.typeObj.MASS)
                //     console.log("massFOOD", obj);
            }
        
        }
        // if(currentPlayer.numberBoom > 0){
        //     console.log("currentPlayer.id", currentPlayer.id);
        //     addBoom(currentPlayer);
        // }
        if(currentPlayer.timeAcceleration.status){
            // console.log("F");
            currentPlayer.timeAcceleration.status = false;
            currentPlayer.timeAcceleration.timeClick = new Date().getTime();
        }
        // if(!currentPlayer.timeAcceleration.status){
        //     if(currentPlayer.timeAcceleration.timeClick + 2000 > new Date().getTime())
        //         return;
        // }
        
        var direction = (currentPlayer.target.x > 0) ? 1: -1;
        
       for (var i = 0; i < food.length; i++) {
            HutObject(food[i]);
        }
        for (var i = 0; i < massFood.length; i++) {
            HutObject(massFood[i]);
        }
        for (var i = 0; i < users.length; i++) {
            HutObject(users[i]);
        }
        for (var i = 0; i < bots.length; i++) {
            HutObject(bots[i]);
        }
        for (var i = 0; i < jellyFishs.length; i++) {
            HutObject(jellyFishs[i]);
        }
        for (var i = 0; i < virus.length; i++) {
            HutObject(virus[i]);
        }
}

function checkFishEatCircle(fish, circle){ 
    if(fish == undefined)
        return false;
    var directionObject = fish.direction == c.direct.RIGHT? 1 : -1;  
    
    var p = new SAT.Polygon(new SAT.Vector(), [
              new SAT.Vector(fish.x + directionObject * fish.width/2, fish.y + fish.height/4),
              new SAT.Vector(fish.x + directionObject * fish.width/2, fish.y - fish.height/4),
              new SAT.Vector(fish.x,fish.y)
            ]);

    var v = new SAT.Vector(circle.x, circle.y);
    return SAT.pointInPolygon(v, p) ;
}

function checkFishInCircle(fish, circle){ 
    if(fish == undefined)
        return false;
    var v1 =  new SAT.Vector(fish.x - fish.width/2,fish.y );
    var v2 = new SAT.Vector(fish.x ,fish.y - fish.height/2);
    var v3 = new SAT.Vector(fish.x + fish.width/2,fish.y );
    var v4 = new SAT.Vector(fish.x ,fish.y + fish.height/2);
    var c = new SAT.Circle(new SAT.Vector(circle.x, circle.y), circle.radius);
    return SAT.pointInCircle(v1, c) || SAT.pointInCircle(v2, c) || SAT.pointInCircle(v3, c) || SAT.pointInCircle(v4, c);
}
function checkFishInPoligon(fish, poligon){
    if(fish == undefined)
        return false;
    var v1 =  new SAT.Vector(fish.x - fish.width/2,fish.y );
    var v2 = new SAT.Vector(fish.x ,fish.y + fish.height/2);
    var v3 = new SAT.Vector(fish.x + fish.width/2,fish.y );
    var v4 = new SAT.Vector(fish.x ,fish.y - fish.height/2);

    var box = new SAT.Polygon(//new SAT.Vector(poligon.x, poligon.y - poligon.height/2), [
        new SAT.Vector(),[
          new SAT.Vector(poligon.x, poligon.y - poligon.height/2),
          new SAT.Vector(poligon.x + poligon.width/2, poligon.y),
          new SAT.Vector(poligon.x, poligon.y + poligon.height/2),
          new SAT.Vector(poligon.x - poligon.width/2, poligon.y)
        ]);

    return SAT.pointInPolygon(v1, box) || SAT.pointInPolygon(v2, box) || SAT.pointInPolygon(v3, box) || SAT.pointInPolygon(v4, box);
}

function checkFishEatFish(fish1, fish2) {
        if(fish1 != undefined && fish2 != undefined && fish1.id != fish2.id) {
            var response = new SAT.Response();
            var directionObject = fish1.direction == c.direct.RIGHT? 1 : -1;
            
            var p = new SAT.Polygon(new SAT.Vector(), [
              new SAT.Vector(fish1.x + directionObject * fish1.width/2, fish1.y + fish1.height/4),
              new SAT.Vector(fish1.x + directionObject * fish1.width/2, fish1.y - fish1.height/4),
              new SAT.Vector(fish1.x,fish1.y)
            ]);
            var v1 =  new SAT.Vector(fish2.x - fish2.width/2,fish2.y );
            var v2 = new SAT.Vector(fish2.x ,fish2.y + fish2.height/2);
            var v3 = new SAT.Vector(fish2.x + fish2.width/2,fish2.y );
            var v4 = new SAT.Vector(fish2.x ,fish2.y - fish2.height/2);
                
            var collided = SAT.pointInPolygon(v1,p) || SAT.pointInPolygon(v2,p) ||SAT.pointInPolygon(v3,p) || SAT.pointInPolygon(v4,p);
            
            return collided;
        }
         return false;
    }
function tickPlayer(currentPlayer) {
    if(!currentPlayer.timeAcceleration.status){
        // console.log(currentPlayer.name, currentPlayer.timeAcceleration.status);
        if(currentPlayer.timeAcceleration.timeClick + 500 > new Date().getTime())
                mouseRight(currentPlayer);
        if(currentPlayer.timeAcceleration.timeClick < new Date().getTime() - c.timeAcceleration){
            currentPlayer.timeAcceleration.timeClick  = 0;
            currentPlayer.timeAcceleration.status = true;
            // console.log("OK");
        }
    }
    
    if(!currentPlayer.timeSpeed.status){
        // console.log(currentPlayer.name, currentPlayer.timeSpeed.status);
        if(currentPlayer.timeSpeed.timeClick < new Date().getTime() - c.timeSpeed){
            currentPlayer.timeSpeed.timeClick  = 0;
            currentPlayer.timeSpeed.status = true;
            // console.log("OK");
        }
    }

    if(currentPlayer.levelUp.status){
        if(currentPlayer.levelUp.time < new Date().getTime() - c.timeLevelUp){
            currentPlayer.levelUp.time  = 0;
            currentPlayer.levelUp.status = false;
        }
    }
    movePlayer(currentPlayer);

    
    function updateRadius(currentPlayer){
        var level = getTypeFish(currentPlayer.massTotal);
        if(currentPlayer.levelUp.level < level) {
            currentPlayer.levelUp.level = level;
            currentPlayer.levelUp.status = true;
            currentPlayer.levelUp.targetMass = c.fishType[level].maxMass;
            currentPlayer.levelUp.time = new Date().getTime();
            currentPlayer.radius = c.fishType[level].radius;
            currentPlayer.width = c.fishType[level].width;
            currentPlayer.height = c.fishType[level].height;
            currentPlayer.column = c.fishType[level].column;
            currentPlayer.row = c.fishType[level].row;
        }
    }
    
    for (var i = 0; i < food.length; i++) {
        if(checkFishEatCircle(currentPlayer, food[i])){
            currentPlayer.massTotal += food[i].mass;
            currentPlayer.kill ++;
            food.splice(i, 1);
            i--;
            
        }
    }
    updateRadius(currentPlayer);
    for (var i = 0; i < massFood.length; i++) {
        if(checkFishEatCircle(currentPlayer, massFood[i])){
            currentPlayer.massTotal += massFood[i].masa;
            massFood.splice(i, 1);
        }
    }
    updateRadius(currentPlayer);

    for (var i = 0; i < virus.length; i++) {
        if(checkFishInCircle(currentPlayer, virus[i])){
            if(currentPlayer.numberBoom < 3)
                currentPlayer.numberBoom += 1;
            virus.splice(i, 1);        
        }
    }
    for (var i = 0; i < booms.length; i++) {
        if(booms[i].status != c.virus.status.DIED &&checkFishInCircle(currentPlayer, booms[i])){
            if(currentPlayer.id == booms[i].playerId)
                return;
            currentPlayer.living.status = false;
            currentPlayer.living.time = new Date().getTime();
            booms[i].status = c.virus.status.DIED;
            var count = 5;
            var masa = currentPlayer.massTotal/count;
            var radius = util.massToRadius(masa);
            for (var i = 0; i < count; i++) {
                massFood.push({
                    id: ((new Date()).getTime() + '' + massFood.length) >>> 0,
                    num: i,
                    masa: masa,
                    hue: currentPlayer.hue,
                    target: {
                        x: currentPlayer.x + Math.cos(2*i *Math.PI/ count) *5000,
                        y: currentPlayer.y + Math.sin(2*i *Math.PI/ count) *5000
                    },
                    x: currentPlayer.x,
                    y: currentPlayer.y,
                    radius: radius,
                    type: c.typeObj.MASS,
                    speed: 25
                });
            }     
        }
    }

    for (var k = 0; k < bots.length; k++) {
            if(getTypeFish(currentPlayer.massTotal) > getTypeFish(bots[k].massTotal) &&checkFishEatFish(currentPlayer, bots[k])){
                currentPlayer.massTotal += bots[k].massTotal;
                currentPlayer.kill ++;
                bots[k].living.status = false;
                bots[k].living.time = new Date().getTime();
            }
        }
    updateRadius(currentPlayer);

    for (var k = 0; k < users.length; k++) {
        if(getTypeFish(currentPlayer.massTotal) > getTypeFish(users[k].massTotal) && checkFishEatFish(currentPlayer, users[k])){
            currentPlayer.massTotal += users[k].massTotal;
            currentPlayer.kill ++;
            users[k].living.status = false;
            users[k].living.time = new Date().getTime();
        }
    }

    for (var k = 0; k < enemies.length; k++) {
        if(checkFishEatFish(enemies[i], currentPlayer)){
            enemies[i].animation.status = true;
            enemies[i].animation.time = new Date().getTime();
            currentPlayer.living.status = false;
            currentPlayer.living.time = new Date().getTime();
        }
    }

    var pos = 0;
    for (var i = 0; i < enemies.length; i++) {
        pos = util.findIndex(users, enemies[i].idTarget);
        if(pos != -1){
            enemies[i].target.x = users[pos].x;
            enemies[i].target.y = users[pos].y;
        }else if(users.length > 0){
            pos = util.randomInRange(0, users.length);
            enemies[i].target.x = users[pos].x;
            enemies[i].target.y = users[pos].y;
            enemies[i].idTarget = users[pos].idTarget;
        }
    
        if(enemies[i].x < enemies[i].target.x){
            enemies[i].direction = c.direct.RIGHT;
        }else {
           // console.log("LEFT");
            enemies[i].direction = c.direct.LEFT;
        }

        for (var j = 0; j < booms.length; j++) {
           if(checkFishInCircle(enemies[i], booms[j])){
                //console.log("BOOOM");
                enemies.splice(i, 1);
                booms[j].status = c.virus.status.DIED;
           }
        }
        for (var k = 0; k < users.length; k++) {
            if(checkFishEatFish(enemies[i], users[k])){
                // sockets[users[k].id].emit('RIP');
                // users.splice(k, 1);
                enemies[i].eatFish.status = true;
                enemies[i].eatFish.time = new Date().getTime();
                users[k].living.status = false;
                pos = util.randomInRange(0, users.length);
                //console.log(pos);
                if(users.length > 0){
                    enemies[i].target.x = users[pos].x;
                    enemies[i].target.y = users[pos].y;
                }
            }
        }
        for (var k = 0; k < bots.length; k++) {
            if(checkFishEatFish(enemies[i], bots[k])){
                //bots.splice(k, 1);
                bots[k].living.status = false;
                pos = util.randomInRange(0, bots.length);
                //console.log(pos);
                if(bots.length > 0){
                    enemies[i].target.x = bots[pos].x;
                    enemies[i].target.y = bots[pos].y;
                }
            }
        }
    }

    
}
function UpdateSpeedAnimation(obj){
    if(obj == undefined){
        console.log(obj);
    }
    obj.speedAnimation = obj.speedAnimation + 1;
    if(obj.speedAnimation >= c.speedAnimation){
            obj.speedAnimation = 0;
            obj.frameAnimation += 1;
            if(obj.frameAnimation >= obj.column * obj.row){
                obj.frameAnimation = 0;
            }
    }
}
function jellyFishCollision(f){
     if(f.jellyCollision.status == true){
            if(f.jellyCollision.time + c.jellyFish.time < new Date().getTime())
                f.jellyCollision.status = false;
            return;
     }
        var v1 =  new SAT.Vector(f.x - f.width/2,f.y );
        var v2 = new SAT.Vector(f.x ,f.y + f.height/2);
        var v3 = new SAT.Vector(f.x + f.width/2,f.y );
        var v4 = new SAT.Vector(f.x ,f.y - f.height/2);

        for (var i = 0; i < jellyFishs.length; i++) {
            var temp = jellyFishs[i];
            var box = new SAT.Polygon(//new SAT.Vector(temp.x- temp.width/2, temp.y- temp.height/2), [
                 new SAT.Vector(),[
                  new SAT.Vector(temp.x - temp.width/2, temp.y - temp.height/2),
                  new SAT.Vector(temp.x + temp.width/2, temp.y - temp.height/2),
                  new SAT.Vector(temp.x + temp.width/2, temp.y + temp.height/2),
                  new SAT.Vector(temp.x - temp.width/2, temp.y + temp.height/2)
                ]);

            if(SAT.pointInPolygon(v1, box) || SAT.pointInPolygon(v2, box) || SAT.pointInPolygon(v3, box) || SAT.pointInPolygon(v4, box)){
                f.jellyCollision.status = true;
                f.jellyCollision.time = (new Date()).getTime();
                return;
            }
        }    
        return;
}
function UpdateJellyCollion(){  
    for (var i = 0; i < users.length; i++) {
        jellyFishCollision(users[i]);
    }
    for (var i = 0; i < food.length; i++) {
        jellyFishCollision(food[i]); 
    }
    for (var i = 0; i < bots.length; i++) {
        jellyFishCollision(bots[i]); 
    }
    for (var i = 0; i < enemies.length; i++) {
        jellyFishCollision(enemies[i]);
    }
}
function moveloop() {
    for (var i = 0; i < users.length; i++) {
        UpdateSpeedAnimation(users[i]);
        if(users[i].living.status)
            tickPlayer(users[i]);
        if(users[i].living.status == false  && users[i].living.time + 2000 < new Date().getTime()){
            sockets[users[i].id].emit('RIP');
            users.splice(i, 1);
            i--;
        }
    }
    for (var i = 0; i < bots.length; i++) {
        if(bots[i].living.status)
            tickPlayer(bots[i]);
        if(bots[i].living.status == false){
            bots.splice(i, 1);
            i--;
        }
    }    

    for (i=0; i < virus.length; i++) {
        moveFood(virus[i]);
        if(virus[i].y < 0){
            virus.splice(i,1);
            i --;
        }
    }

    var currentTime = new Date().getTime();
    for (i=0; i < booms.length; i++) {

        if(booms[i].status == c.virus.status.LIVE){
            if(currentTime > booms[i].time + c.defaultTime){
                booms[i].status = c.virus.status.DIED;
            }
        }
        if(booms[i].status == c.virus.status.DIED)
        {
            booms[i].frameAnimation ++;
            if(booms[i].frameAnimation > 60){
                booms[i] = {};
                booms.splice(i,1);
                i--;
            }
        }
    }

    for (i=0; i < massFood.length; i++) {
        if(massFood[i].speed > 0) moveFood(massFood[i]);
    }

    for (i=0; i < food.length; i++) {
        if(food[i] != undefined){
            UpdateSpeedAnimation(food[i]);
            moveFood(food[i]);
        }
    }
    for (var i = 0; i < airBubbles.length; i++) {
            moveFood(airBubbles[i]);     
            if(airBubbles[i].target.y > airBubbles[i].y){
                airBubbles[i] = {};
                airBubbles.splice(i,1);
                i--;
            }
    }

    for (var i = 0; i < jellyFishs.length; i++) {
            UpdateSpeedAnimation(jellyFishs[i]);
            moveFood(jellyFishs[i]);     
            if(jellyFishs[i].y < 0){
                jellyFishs[i] = {};
                jellyFishs.splice(i,1);
                i--;
            }
    }

    for (var i = 0; i < enemies.length; i++) {
        if(enemies[i].eatFish.status){
            UpdateSpeedAnimation(enemies[i]);
            if(enemies[i].eatFish.time + 1000 < new Date().getTime()){
                enemies[i].eatFish.status = false;
                enemies[i].eatFish.time = 0;
            }
        }
        moveFood(enemies[i]);     
    }
}
function tickFood(food){
    function funcMinFood(f) {
        if(f.choose == true && f.timeOut + 6000 < new Date().getTime()){
            food.stand = true;
            return true;
        }
        var circle = new C(new V(food.x,food.y), food.radius);
        return SAT.pointInCircle(new V(f.x, f.y), circle);
    }

    function deleteFood(f) {
        minFood[f] = {};
        minFood.splice(f, 1);
    }

    function findMinFood(){
        var min = 0;
        var index = -1;
        for (var i = 0; i < minFood.length; i++) {
            if(minFood[i] != undefined && minFood[i].choose == false && (index == -1 || min > util.getDistance(minFood[i], food))) {
                min = util.getDistance(minFood[i], food);
                index = i;
            }
        }
        if(index == -1){    
            return undefined;
        }
        minFood[index].timeOut = new Date().getTime();
        minFood[index].choose = true;
        return minFood[index];
    }
    var minFoodEaten = minFood.map(funcMinFood)
        .reduce( function(a, b, c) { return b ? a.concat(c) : a; }, []);
    minFoodEaten.forEach(deleteFood);

    if(food.isHut == false){
        var length = minFood.length;
        var data = findMinFood();
        if(data != undefined){
            food.target.x = data.x;
            food.target.y = data.y;
            food.stand = false;
            food.direction = food.target.x > food.x ? c.direct.RIGHT : c.direct.LEFT;
        }
    }
}

function gameloop() {
    if (users.length > 0) {
        users.sort( function(a, b) { return b.kill - a.kill; });

        var topUsers = [];

        for (var i = 0; i < Math.min(10, users.length); i++) {
            if(users[i].type == 'player') {
                topUsers.push({
                    id: users[i].id,
                    name: users[i].name,
                    kill: users[i].kill
                });
            }
        }
        if (isNaN(leaderboard) || leaderboard.length !== topUsers.length) {
            leaderboard = topUsers;
            // console.log("leaderboard", leaderboard);
            leaderboardChanged = true;
        }
        else {
            for (i = 0; i < leaderboard.length; i++) {
                if (leaderboard[i].id !== topUsers[i].id) {
                    leaderboard = topUsers;
                    leaderboardChanged = true;
                    break;
                }
            }
        }
        
    }
    balanceMass();
    UpdateJellyCollion();
}

function sendUpdates() {
    users.forEach( function(u) {
        // center the view if x/y is undefined, this will happen for spectators
        u.x = u.x || c.gameWidth / 2;
        u.y = u.y || c.gameHeight / 2;

        // console.log("food: ", food);
        var visibleFood  = food
            .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - 20 &&
                    f.x < u.x + u.screenWidth/2 + 20 &&
                    f.y > u.y - u.screenHeight/2 - 20 &&
                    f.y < u.y + u.screenHeight/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });
        var visibleJellyFish = jellyFishs
        .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - 20 &&
                    f.x < u.x + u.screenWidth/2 + 20 &&
                    f.y > u.y - u.screenHeight/2 - 20 &&
                    f.y < u.y + u.screenHeight/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });
        var visibleAirbble  = airBubbles
            .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - 20 &&
                    f.x < u.x + u.screenWidth/2 + 20 &&
                    f.y > u.y - u.screenHeight/2 - 20 &&
                    f.y < u.y + u.screenHeight/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleMass = massFood
            .map(function(f) {
                if ( f.x+f.radius > u.x - u.screenWidth/2 - 20 &&
                    f.x-f.radius < u.x + u.screenWidth/2 + 20 &&
                    f.y+f.radius > u.y - u.screenHeight/2 - 20 &&
                    f.y-f.radius < u.y + u.screenHeight/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleVirus  = virus
            .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - f.radius &&
                    f.x < u.x + u.screenWidth/2 + f.radius &&
                    f.y > u.y - u.screenHeight/2 - f.radius &&
                    f.y < u.y + u.screenHeight/2 + f.radius) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleBoom  = booms
            .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - f.radius &&
                    f.x < u.x + u.screenWidth/2 + f.radius &&
                    f.y > u.y - u.screenHeight/2 - f.radius &&
                    f.y < u.y + u.screenHeight/2 + f.radius) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleEnemy  = enemies
            .map(function(f) {
                if ( f.x > u.x - u.screenWidth/2 - f.radius &&
                    f.x < u.x + u.screenWidth/2 + f.radius &&
                    f.y > u.y - u.screenHeight/2 - f.radius &&
                    f.y < u.y + u.screenHeight/2 + f.radius) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleCells  = users
            .map(function(f) {
                if ( f.x+f.radius > u.x - u.screenWidth/2 - 20 &&
                    f.x-f.radius < u.x + u.screenWidth/2 + 20 &&
                    f.y+f.radius > u.y - u.screenHeight/2 - 20 &&
                    f.y-f.radius < u.y + u.screenHeight/2 + 20) {
                    if(f.id !== u.id) {
                        return {
                            id: f.id,
                            x: f.x,
                            y: f.y,
                            numberBoom: f.numberBoom,
                            target: f.target,
                            radius: f.radius,
                            direction: f.direction,
                            frameAnimation: f.frameAnimation,
                            massTotal: Math.round(f.massTotal),
                            hue: f.hue,
                            name: f.name,
                            timeAcceleration: f.timeAcceleration,
                            timeSpeed: f.timeSpeed,
                            width: f.width,
                            height: f.height,
                            levelUp: f.levelUp,
                            jellyCollision: f.jellyCollision,
                            living: f.living
                        };
                    } else {
                        // console.log(f.name, f.timeAcceleration, f.timeSpeed);
                        return {
                            x: f.x,
                            y: f.y,
                            numberBoom: f.numberBoom,
                            target: f.target,
                            radius: f.radius,
                            direction: f.direction,
                            frameAnimation: f.frameAnimation,
                            massTotal: Math.round(f.massTotal),
                            hue: f.hue,
                            timeAcceleration: f.timeAcceleration,
                            timeSpeed: f.timeSpeed,
                            width: f.width,
                            height: f.height,
                            levelUp: f.levelUp,
                            jellyCollision: f.jellyCollision,
                            living: f.living
                        };
                    }
                }
             
            })
            .filter(function(f) { return f; });

            var botVisible  = bots
            .map(function(f) {
                if ( f.x+f.radius > u.x - u.screenWidth/2 - 20 &&
                    f.x-f.radius < u.x + u.screenWidth/2 + 20 &&
                    f.y+f.radius > u.y - u.screenHeight/2 - 20 &&
                    f.y-f.radius < u.y + u.screenHeight/2 + 20) {
                    if(f.id !== u.id) {
                        return {
                            id: f.id,
                            x: f.x,
                            y: f.y,
                            numberBoom: f.numberBoom,
                            target: f.target,
                            radius: f.radius,
                            direction: f.direction,
                            frameAnimation: f.frameAnimation,
                            massTotal: Math.round(f.massTotal),
                            hue: f.hue,
                            name: f.name,
                            timeAcceleration: f.timeAcceleration,
                            timeSpeed: f.timeSpeed,
                            width: f.width,
                            height: f.height,
                            levelUp: f.levelUp,
                            jellyCollision: f.jellyCollision,
                            status: f.strategy.status
                        };
                    }
                }
            })
            .filter(function(f) { return f; });

            var userRadar = users.map(function(f){
                
                if( f.id != u.id)
                return {
                    x : f.x,
                    y : f.y
                }

            })
            .filter(function(f) { return f; });

            userRadar = bots.map(function(f){
                
                if( f.id != u.id)
                return {
                    x : f.x,
                    y : f.y
                }

            })
            .filter(function(f) { return f; });
        
        sockets[u.id].emit('serverTellPlayerMove', visibleCells, visibleFood, visibleVirus, visibleMass, visibleAirbble, visibleJellyFish, visibleBoom,visibleEnemy, botVisible, userRadar);
        
        if (leaderboardChanged) {
            sockets[u.id].emit('leaderboard', {
                players: users.length,
                leaderboard: leaderboard
            });
        }
    });
    leaderboardChanged = false;
}

setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / c.networkUpdateFactor);

function EnemyStrategy(){
    var pos = 0;
    for (var i = 0; i < enemies.length; i++) {
        if(enemies[i].animation.status && enemies[i].animation.time + 1000 < new Date().getTime()){
            enemies[i].animation.status = false;
            enemies[i].animation.time = 0;
        }
        pos = util.findIndex(users, enemies[i].idTarget);
        if(pos != -1){
            enemies[i].target.x = users[pos].x;
            enemies[i].target.y = users[pos].y;
        }else if(users.length > 0){
            pos = util.randomInRange(0, users.length);
            enemies[i].target.x = users[pos].x;
            enemies[i].target.y = users[pos].y;
            enemies[i].idTarget = users[pos].idTarget;
        }
    
        if(enemies[i].x < enemies[i].target.x){
            enemies[i].direction = c.direct.RIGHT;
        }else {
            enemies[i].direction = c.direct.LEFT;
        }

        for (var j = 0; j < booms.length; j++) {
           if(checkFishInCircle(enemies[i], booms[j])){
                enemies.splice(i, 1);
                booms[j].status = c.virus.status.DIED;
           }
        }
    }
}
setInterval(function(){
    for (var i = 0; i < bots.length; i++) {
        findEnemyToEat(bots[i]);
        FindDirectionForBot(bots[i]);
    }
    for (var i = 0; i < food.length; i++) {
        tickFood(food[i]);
    }
    EnemyStrategy();
},1000);

var serverPort = process.env.PORT || port;
http.listen(serverPort, function() {
  console.log("Server is listening on port " + serverPort);
  // console.log("App contain:", app);
});


