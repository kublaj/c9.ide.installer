define(function(require, exports, module) {
    main.consumes = ["Plugin", "installer", "c9"];
    main.provides = ["installer.npm-g"];
    return main;
    
    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var installer = imports.installer;
        var c9 = imports.c9;
        
        var bashBin = options.bashBin || "bash";
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        function execute(task, options, onData, callback) {
            var script = [
                c9.debug ? "set -x" : "",
                "set -e",
                
                "export C9_DIR=$HOME/.c9",
                "export PATH=$PATH:$C9_DIR/node/bin:$C9_DIR/node_modules/.bin",
                "export NPM=$(which npm)",
                "export NPM_BIN_DIR=$(npm bin -g)",
                
                "mkdir -p $C9_DIR/empty",
                "cd $C9_DIR/empty",
                
                "if [[ -w $NPM_BIN_DIR ]]; then",
                    "$NPM install -g --production " + task,
                "else",
                    "$C9_DIR/node/bin/npm install -g --production " + task,
                "fi"
            ];
            
            installer.ptyExec({
                name: "npm-g",
                bash: bashBin,
                code: script.join("\n"),
                cwd: options.cwd,
            }, onData, callback);
        }
        
        function isAvailable(callback) {
            callback(true);
        }
        
        plugin.on("load", function() {
            if (c9.platform !== "win32")
                installer.addPackageManager("npm-g", plugin);
        });
        plugin.on("unload", function() {
            if (c9.platform !== "win32")
                installer.removePackageManager("npm-g");
        });
        
        plugin.freezePublicAPI({ execute: execute, isAvailable: isAvailable });
        
        register(null, { "installer.npm-g": plugin });
    }
});