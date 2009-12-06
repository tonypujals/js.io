// PKG/browser.js

;(function() {
	var ENV, LOCAL;
	
	function bind(context, method/*, args... */) {
		var args = Array.prototype.slice.call(arguments, 2);
		return function(){
			method = (typeof method == 'string' ? context[method] : method);
			return method.apply(context, args.concat(Array.prototype.slice.call(arguments, 0)));
		}
	}
	
	LOCAL = {
		sourceCache: {},
		baseModCache: {}
	};
	
	LOCAL.envName = typeof node !== 'undefined' && typeof process !== 'undefined' && process.version ? 'node' : 'browser';
	switch(LOCAL.envName) {
		case 'node':
			ENV = new ENV_node();
			break;
		case 'browser':
		default:
			ENV = new ENV_browser();
			break;
	}
	
	ENV.getName = function() { return LOCAL.envName; }
	
	var PKG = ENV.global.PKG = bind(this, importer, ENV.global, '');
	PKG.__env = ENV;
	PKG.__dir = ENV.getCwd();
	PKG.__filename = 'PKG.js';
	
	PKG.modules = [];
	PKG.path = [ENV.getPath()];
	PKG.global = ENV.global;
	
	// DONE
	
	/*
	function ENV_abstract() {
		this.global = null;
		this.getCwd = function() {};
		this.getPath = function() {};
		this.eval = function(code, path) {};
		this.findModule = function(pathString) {};
	}
	*/
	
	function ENV_node() {
		var posix = require('posix');
		
		this.global = GLOBAL;
		this.getCwd = process.cwd;
		this.log = function() { process.stdio.writeError(Array.prototype.join.call(arguments, ' ') + '\n'); }
		this.getPath = function() {
			var segments = __filename.split('/');
			segments.pop();
			return segments.join('/') || '.';
		}
		this.eval = function(code, path) {
			try {
				return process.compile(code, path);
			} catch(e) {
				if(e instanceof SyntaxError) {
					this.log("Syntax Error loading ", args.location, e);
				}
				throw e;
			}
		}
		this.findModule = function(possibilities) {
			for (var i = 0, possible; possible = possibilities[i]; ++i) {
				try {
					possible.src = posix.cat(possible.filePath).wait();
					return possible;
				} catch(e) {}
			}
			return false;
		}
		this.require = require;
	}
	
	function ENV_browser() {
		var XHR = window.XMLHttpRequest || function() { return new ActiveXObject("Msxml2.XMLHTTP"); }
		
		this.global = window;
		this.global.PKG = PKG;
		
		this.log = typeof console != 'undefined' && console.log ? bind(console, 'log') : function() {}
		
		var cwd = null;
		this.getCwd = function() {
			if(!cwd) {
				try {
					var filename = new RegExp('(.*?)' + PKG.__filename + '(\\?.*)?$');
					var scripts = document.getElementsByTagName('script');
					for (var i = 0, script; script = scripts[i]; ++i) {
						var result = script.src.match(filename);
						if (result) {
							if (/^[A-Za-z]*:\/\//.test(result[1])) {
								cwd = result[1];
							} else { // IE6 URLs aren't absolute unless we use innerHTML
								var el = document.createElement('div');
								el.innerHTML = '<a href="' + result[1].replace(/"/g, '\\\"') + '"></a>';
								cwd = el.href;
								el = null;
							}
							break;
						}
					}
				} catch(e) {}
			}
			return cwd;
		}
		
		this.getPath = function() {
			return this.getCwd();
		}

		// IE6 won't return an anonymous function from eval, so use the function constructor instead
		var rawEval = typeof eval('(function(){})') == 'undefined'
			? function(src, path) { return (new Function('return ' + src))(); }
			: function(src, path) { var src = src + '\n//@ sourceURL=' + path; return window.eval(src); }

		// provide an eval with reasonable debugging
		this.eval = function(code, path) {
			try { return rawEval(code, path); } catch(e) {
				if(e instanceof SyntaxError) {
					var src = 'javascript:document.open();document.write("<scr"+"ipt src="' + path + '"></scr"+"ipt>")';
					var callback = function() {
						var el = document.createElement('iframe');
						with(el.style) { position = 'absolute'; top = left = '-999px'; width = height = '1px'; visibility = 'hidden'; }
						el.src = src;
						$setTimeout(function() {
							document.body.appendChild(el);
						}, 0);
					}
					
					if(document.body) { callback(); }
					else { window.addEventListener('load', callback, false); }
					throw new Error("forcing halt on load of " + path);
				}
				throw e;
			}
		}
		
		this.findModule = function(possibilities) {
			for (var i = 0, possible; possible = possibilities[i]; ++i) {
				var xhr = new XHR();
				try {
					xhr.open('GET', possible.filePath, false);
					xhr.send(null);
				} catch(e) {
					continue; // firefox file://
				}
				
				if (xhr.status == 404 || // all browsers, http://
					xhr.status == -1100 || // safari file://
					// XXX: We have no way to tell in opera if a file exists and is empty, or is 404
					// XXX: Use flash?
					//(!failed && xhr.status == 0 && !xhr.responseText && EXISTS)) // opera
					false)
				{
					continue;
				}
				
				possible.src = xhr.responseText;
				return possible;
			}
			
			return false;
		}
	};
	
	function guessModulePath(pathString) {
		var pathSegments = pathString.split('.'),
			baseMod = pathSegments[0],
			modPath = pathSegments.join('/');
		
		if (baseMod in LOCAL.baseModCache) {
			return [{filePath: LOCAL.baseModCache[baseMod] + modPath + '.js'}];
		}

		var out = [];
		for (var i = 0, path; path = PKG.path[i]; ++i) {
			if(path.charAt(path.length - 1) != '/') { path += '/'; } // TODO: can we remove this check
			out.push({filePath: path + modPath + '.js', baseMod: baseMod, basePath: path});
		}
		return out;
	}
	
	// load a module from a file
	function loadModule(pathString) {
		var possibilities = guessModulePath(pathString);
			module = ENV.findModule(possibilities);
		
		if(!module) {
			var paths = [];
			for (var i = 0, p; p = possibilities[i]; ++i) { paths.push(p.filePath); }
			throw new Error("Module not found: " + pathString + " (looked in " + paths.join(', ') + ")");
		}
		
		if (!(module.baseMod in LOCAL.baseModCache)) {
			LOCAL.baseModCache[module.baseMod] = module.basePath;
		}
		
		return module;
	}
	
	function execModule(context, module) {
		var code = "(function(_){with(_){delete _;(function(){" + module.src + "\n}).call(this)}})";
		var fn = ENV.eval(code, module.filePath);
		try {
			fn.call(context.exports, context);
		} catch(e) {
			if(e.type == "stack_overflow") {
				ENV.log("Stack overflow in", module.filePath, ':', e);
			} else {
				ENV.log("error when loading", module.filePath, ':', e);
			}
			throw e;
		}
	};
	
	function resolveRelativePath(pkg, path) {
		if(pkg.charAt(0) == '.') {
			pkg = pkg.substring(1);
			var segments = path.split('.');
			while(pkg.charAt(0) == '.') {
				pkg = pkg.slice(1);
				segments.pop();
			}
			
			var prefix = segments.join('.');
			if (prefix) {
				return prefix + '.' + pkg;
			}
		}
		return pkg;
	}
	
	function resolveImportRequest(path, request) {
		var match, imports = [];
		if((match = request.match(/^(from|external)\s+([\w.$]+)\s+import\s+(.*)$/))) {

			imports[0] = {
				from: resolveRelativePath(match[2], path),
				external: match[1] == 'external', "import": {}
			};
			
			match[3].replace(/\s*([\w.$*]+)(?:\s+as\s+([\w.$]+))?/g, function(_, item, as) {
				imports[0]["import"][item] = as || item;
			});
		} else if((match = request.match(/^import\s+(.*)$/))) {
			match[1].replace(/\s*([\w.$]+)(?:\s+as\s+([\w.$]+))?,?/g, function(_, pkg, as) {
				fullPkg = resolveRelativePath(pkg, path);
				imports[imports.length] = as ? {from: fullPkg, as: as} : {from: fullPkg, as: pkg};
			});
		} else {
			var msg = 'Invalid PKG request: PKG(\'' + request + '\')';
			throw SyntaxError ? new SyntaxError(msg) : new Error(msg);
		}
		return imports;
	};
	
	function makeContext(pkgPath, filePath) {
		var ctx = {
			exports: {},
			global: ENV.global
		};
		
		ctx.PKG = bind(this, importer, ctx, pkgPath);
		
		// TODO: FIX for "trailing ." case
		var cwd = ENV.getCwd();
		var i = filePath.lastIndexOf('/');

		ctx.PKG.__env = PKG.__env;
		ctx.PKG.__dir = i > 0 ? makeRelativePath(filePath.substring(0, i), cwd) : '';
		ctx.PKG.__filename = i > 0 ? filePath.substring(i) : filePath;
		ctx.PKG.global = ENV.global;
		
		return ctx;
	};
	
	function makeRelativePath(path) {
		var cwd = ENV.getCwd();
		var i = path.match('^' + cwd);
		if (i && i[0] == cwd) {
			var offset = path[cwd.length] == '/' ? 1 : 0
			return path.slice(cwd.length + offset);
		}
		return path;
	};
	
	function importer(context, path, request, altContext) {
		var imports = resolveImportRequest(path, request);
		
		// import each item in the request
		for(var i = 0, item, len = imports.length; (item = imports[i]) || i < len; ++i) {
			var pkg = item.from;
			
			var j = item.from.lastIndexOf('.');
			var modules = PKG.modules;
			
			// eval any packages that we don't know about already
			if(!(pkg in modules)) {
				try {
					var module = LOCAL.sourceCache[pkg] || loadModule(pkg);
				} catch(e) {
					ENV.log('Error executing \'' + request + '\': could not load module ' + pkg);
					throw e;
				}
				
				if(!item.external) {
					var pkgPath = j > 0 ? item.from.substring(0, j) : '';
					var newContext = makeContext(pkgPath, module.filePath);
					execModule(newContext, module);
					modules[pkg] = newContext.exports;
				} else {
					var newContext = {};
					for(var j in item['import']) {
						newContext[j] = undefined;
					}
					execModule(newContext, module);
					modules[pkg] = newContext;
					for(var j in item['import']) {
						if(newContext[j] === undefined) {
							newContext[j] = ENV.global[j];
						}
					}
				}
			}
			
			var c = altContext || context;
			if(item.as) {
				// remove trailing/leading dots
				var segments = item.as.match(/^\.*(.*?)\.*$/)[1].split('.');
				for(var k = 0, slen = segments.length - 1, segment; (segment = segments[k]) && k < slen; ++k) {
					if(!segment) continue;
					if (!c[segment]) { c[segment] = {}; }
					c = c[segment];
				}
				c[segments[slen]] = modules[pkg];
			} else if(item['import']) {
				if(item['import']['*']) {
					for(var k in modules[pkg]) { c[k] = modules[pkg][k]; }
				} else {
					try {
						for(var k in item['import']) { c[item['import'][k]] = modules[pkg][k]; }
					} catch(e) {
						ENV.log('module: ', modules);
						throw e;
					}
				}
			}
		}
	}
})();
