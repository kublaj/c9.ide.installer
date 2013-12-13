define(function(require, exports, module) {
    main.consumes = ["Wizard", "WizardPage", "ui", "vfs"];
    main.provides = ["installer"];
    return main;

    function main(options, imports, register) {
        var Wizard     = imports.Wizard;
        var WizardPage = imports.WizardPage;
        var ui         = imports.ui;
        
        var Stream     = require("stream").Stream;
        var async      = require("async");
        
        /***** Initialization *****/
        
        var plugin = new Wizard("Ajax.org", main.consumes, {
            title: "Installation Wizard"
        });
        // var emit   = plugin.getEmitter();
        
        var installScript = options.installScript;
        var homeDir = options.homeDir;
        var logDiv, spinner, lastOutput, vfs, pid;
        
        var loaded = false;
        function load(){
            if (loaded) return;
            loaded = true;
            
            imports.vfs.on("install", function(e){
                vfs = e.vfs;
                
                plugin.once("finish", function(){
                    plugin.hide();
                    e.callback(true);
                });
                plugin.show(true);
            });
        }
        
        var drawn;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            ui.insertCss(require("text!./style.css"), plugin);
            
            // Page Choice - explain + choice manual vs automatic
            var choice = new WizardPage({ name: "choice" });
            choice.on("draw", function(options){
                ui.insertHtml(options.html, 
                    require("text!./pages/choice.html"), choice);
                
            });
            
            // Page Automatic - Show Log Output & Checkbox
            var automatic = new WizardPage({ name: "automatic" });
            automatic.on("draw", function(options){
                var div = options.html;
                ui.insertHtml(div, require("text!./pages/automatic.html"), automatic);
                
                logDiv   = div.querySelector(".log");
                spinner  = div.querySelector(".progress");
                
                var cb = div.querySelector("#details");
                cb.addEventListener("click", function(){
                    if (cb.checked) {
                        logDiv.className = "log details";
                    }
                    else {
                        logDiv.className = "log";
                    }
                });
                
                plugin.addOther(function(){
                    div.innerHTML = "";
                    div.parentNode.removeChild(div);
                });
                
                // c9.on("stateChange", function(e){
                //     if (!(e.state & c9.NETWORK)) {
                //         spinner.innerHTML = "<div style='color:orange'>Lost network "
                //             + "connection. Please restart Cloud9 IDE and "
                //             + "try again.</div>";
                //     }
                // }, plugin);
            });
            
            // Page Manual - Explain the Manual Process (show terminal?) + Button to Retry
            var manual = new WizardPage({ name: "manual", last: true });
            manual.on("draw", function(options){
                ui.insertHtml(options.html, 
                    require("text!./pages/manual.html"), manual);
                
            });
            
            plugin.on("next", function(e){
                var page = e.activePage;
                if (page.name == "choice") {
                    var rb = page.container.querySelector("#auto");
                    
                    if (rb.checked){
                        setTimeout(start);
                        return automatic;
                    }
                    else {
                        return manual;
                    }
                }
            });
            
            plugin.startPage  = choice;
        }
        
        /***** Methods *****/
        
        function log(msg){
            (lastOutput || logDiv).insertAdjacentHTML("beforeend", msg);
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        
        function logln(msg){
            logDiv.insertAdjacentHTML("beforeend", msg + "<br />");
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        
        function start(services, callback){
            plugin.showCancel = true;
            
            plugin.update([
                { id: "previous", visible: false },
                { id: "next", visible: false }
            ]);
            
            // Start Installation
            logln("Starting Installation...");
            spinner.style.display = "block";
            
            var path = "~/.c9/install.sh";
            

            require(["text!" + installScript], function(data) {
                
                async.series([
                    function writeFile(next) {
                        var stream  = new Stream();
                        var options = {
                            stream: stream,
                            parents: true
                        };
                        stream.readable = true;
                
                        vfs.mkfile(path, options, next);
                        
                        stream.emit("data", data);
                        stream.emit("end");
                    },
                    function chmod(next) {
                        path = path.replace("~", homeDir);
                        vfs.execFile("chmod", { args: ["+x", path] }, next);
                    },
                    function spawn(next) {
                        var options = { 
                            stdoutEncoding : "utf8",
                            stderrEncoding : "utf8",
                            stdinEncoding  : "utf8"
                        };
                        
                        vfs.spawn(path, options, function(err, meta){
                            if (err) return next(err);
                            
                            var process = meta.process;
                            var buffer  = "";
                            process.stdout.on("data", function(chunk){
                                var idx = chunk.lastIndexOf("\n");
                                if (idx != -1) {
                                    var meat = buffer + chunk.substr(0, idx);
                                    meat.split("\n").forEach(function(line){
                                        if (line.charAt(0) == ":")
                                            progress(line.substr(1));
                                        else
                                            progress(line + "\n", true);
                                    });
                                    buffer = "";
                                }
                                
                                buffer += idx == -1 ? chunk : chunk.substr(idx);
                            });
                            
                            process.stderr.on("data", function(chunk){
                                progress(chunk, true, true);
                            });
                            
                            process.on("exit", function(){
                                next();
                            });
                            
                            pid = process.pid;
                        });
                    }
                ], function(err) {
                    if (err) {
                        progress(err.message, true, true);
                        done();
                    }
                    else {
                        done();
                    }
                });
            });
            
            function progress(message, output, error){
                if (!message.trim()) return;
                if (output) {
                    if (!lastOutput) {
                        log("<div class='output'></div>");
                        lastOutput = logDiv.lastChild;
                    }
                    if (error)
                        message = "<span class='error'>" + message + "</span>";
                    log(message);
                }
                else {
                    lastOutput = null;
                    logln(message);
                }
            }
            
            function done(){
                logDiv.style.paddingBottom = "60px";
                logDiv.scrollTop = logDiv.scrollHeight;
                
                plugin.showCancel = false;
                
                vfs.stat("~/.c9/installed", {}, function(err, stat){
                    if (err) {
                        logln("<span class='error'>One or more errors occured. "
                          + "Please try to resolve them and\n"
                          + "restart Cloud9 or contact support@c9.io.</span>");
                          
                        spinner.style.display = "none";
                        logDiv.className = "log details";
                        
                        plugin.update([
                            { id: "previous", visible: true },
                        ]);
                    }
                    else {
                        spinner.style.display = "none";
                        
                        plugin.showFinish = true;
                    }
                })
            }
        }
        
        /***** Lifecycle *****/
        
        plugin.on("draw", function(){
            draw();
        });
        
        plugin.on("load", function(){
            load();
        });
        
        plugin.on("cancel", function(e){
            if (e.activePage.name == "automatic") {
                // @todo fjakobs - cancel the installation
                vfs.execFile("kill", { args: [pid] }, function(err){
                    
                });
            }
            // @todo return to the dashboard
        });
        
        plugin.on("unload", function(){
            
        });
        
        /***** Register and define API *****/
        
        /**
         * Installer for Cloud9 IDE
         **/
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            installer: plugin
        });
    }
});