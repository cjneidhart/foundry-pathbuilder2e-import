let debug = false;
const VERSION = "0.8";

const COLOR_1 = "color: #7bf542"; //bright green

const ABILITY_SCORES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

Hooks.on("init", () => {
  libWrapper.register('pathbuilder2e-import', 'ActorDirectory.prototype._getEntryContextOptions', function (wrapped, ...args) {
    const pathbuilderOption = {
      name: 'SIDEBAR.ImportPathbuilder',
      icon: '<i class="fas fa-file-import"></i>',
      condition: li => {
        const doc = ActorDirectory.collection.get(li.data('documentId'));
        return doc.isOwner;
      },
      callback: li => {
        const doc = this.constructor.collection.get(li.data('documentId'));
        console.log(doc);
      }
    };
    const contextOptions = wrapped(...args);
    contextOptions.push(pathbuilderOption);
    return contextOptions;
  });
  game.modules.get("pathbuilder2e-import").api = {
    beginPathbuilderImport: beginPathbuilderImport,
  };
  Hooks.callAll(
    "pathbuilder2eimportReady",
    game.modules.get("pathbuilder2e-import").api
  );
});

Hooks.on("ready", function () {
  console.log("%cPathbuilder2e Import | Initializing", COLOR_1);
  game.settings.register("pathbuilder2e-import", "debugEnabled", {
    name: "Enable debug mode",
    hint: "Debug output will be written to the js console.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => (debug = value),
  });
  debug = game.settings.get("pathbuilder2e-import", "debugEnabled");
});
