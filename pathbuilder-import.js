let debug = false;
const VERSION = "0.8";

const COLOR_1 = "color: #7bf542"; //bright green

const ABILITY_SCORES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = [
  ['acrobatics', 'acr'],
  ['arcana', 'arc'],
  ['athletics', 'ath'],
  ['crafting', 'cra'],
  ['deception', 'dec'],
  ['diplomacy', 'dip'],
  ['intimidation', 'itm'],
  ['medicine', 'med'],
  ['nature', 'nat'],
  ['occultism', 'occ'],
  ['performance', 'prf'],
  ['religion', 'rel'],
  ['society', 'soc'],
  ['stealth', 'ste'],
  ['survival', 'sur'],
  ['thievery', 'thi'],
];

const packCache = new Map();

function log(message) {
  if (!debug) return;
  console.log('%cPathbuilder Import | ' + message, COLOR_1);
}

/** Load a compendium pack, or use a cached copy. */
async function loadPack(name) {
  let pack = packCache.get(name);
  if (!pack) {
    pack = await game.packs.get(name).getDocuments();
    packCache.set(name, pack);
  }
  return pack;
}

async function fetchPathbuilderBuild(buildId) {
  const url = `https://www.pathbuilder2e.com/json.php?id=${buildId}`;
  return fetch(url)
    .then(response => response.json())
    .then(json => json.build);
}

async function loadDeity(output, build) {
  const deities = await loadPack('pf2e.deities');
  const deity = deities.find(x => x.name === build.deity);
  if (deity) {
    output.deity = deity;
  }
}

/** Given a Pathbuilder JSON object, construct a foundry-like JSON object. */
function constructJSON(build) {
  const output = {};

  // Easy plaintext properties
  output.name = build.name;
  output.type = 'character';
  output.prototypeToken = { name: build.name };
  output.system = {
    details: {
      age: {
        value: build.age
      },
      gender: {
        value: build.gender
      },
      alignment: {
        value: build.alignment
      },
    },
  };
  // Skill proficiencies, excluding Lore
  output.system.skills = {};
  for (const [skillName, skillAbbr] of SKILLS) {
    output.system.skills[skillAbbr] = {
      rank: build.proficiencies[skillName] / 2
    };
  }
  // Ability modifiers
  output.system.abilities = {};
  for (const ability of ABILITY_SCORES) {
    output.system.abilities[ability] = { value: build.abilities[ability] };
  }

  loadDeity(output, build);

  return output;
}

/** Perform the import using an Actor document and a buildId
 * @param targetActor an Actor document to overwrite
 * @param buildId a six-digit string 
 */
export async function pathbuilderImportFromId(targetActor, buildId) {
  const build = await fetchPathbuilderBuild(buildId);
  const json = constructJSON(build);
  return targetActor.importFromJSON(JSON.stringify(json));
}

export async function pathbuilderImportDialog(targetActor) {
  let applyChanges = false;
  return new Dialog({
  title: `Pathbuilder Import`,
    content: `
      <div>
        <p><strong>It is strongly advised to import to a blank PC and not overwrite an existing PC.</strong></p>
        <hr>
        <p>Step 1: Refresh this browser page!</p>
        <p>Step 2: Export your character from Pathbuilder 2e via the app menu</p>
        <p>Step 3: Enter the 6 digit user ID number from the pathbuilder export dialog below</p>
        <br>
        <p>Please note - items which cannot be matched to the Foundry database will not be imported!</p>
        <p><strong>All inventory items will be removed upon import.</strong> The option to turn this off will return in the future. If you need to keep items, I recommend creating a new PC, importing via Pathbuilder to the new PC, then dragging inventory items from old PC to new PC.</p>
      <div>
      <hr/>
      <div id="divCode">
        Enter your pathbuilder user ID number<br>
        <div id="divOuter">
          <div id="divInner">
            <input id="textBoxBuildID" type="number" maxlength="6" />
          </div>
        </div>
      </div>
      <br><br>
      <style>
        #textBoxBuildID {
            border: 0px;
            padding-left: 15px;
            letter-spacing: 42px;
            background-image: linear-gradient(to left, black 70%, rgba(255, 255, 255, 0) 0%);
            background-position: bottom;
            background-size: 50px 1px;
            background-repeat: repeat-x;
            background-position-x: 35px;
            width: 330px;
            min-width: 330px;
          }
          #divInner{
            left: 0;
            position: sticky;
          }
          #divOuter{
            width: 285px;
            overflow: hidden;
          }
          #divCode{
            border: 1px solid black;
            width: 300px;
            margin: 0 auto;
            padding: 5px;
          }
          #checkBoxMoney{
            margin-left: 35px;
          }
      </style>
      `,
    buttons: {
      yes: {
        icon: "<i class='fas fa-check'></i>",
        label: `Import`,
        callback: () => (applyChanges = true),
      },
      no: {
        icon: "<i class='fas fa-times'></i>",
        label: `Cancel`,
      },
    },
    default: "yes",
    close: (html) => {
      if (applyChanges) {
        const buildId = html.find('[id="textBoxBuildID"]')[0].value;
        if (!isPathbuilderId(buildId)) {
          ui.notifications.warn("Build ID must be 6 digits");
          return;
        }
        log('Import build ' + buildId);
        pathbuilderImportFromId(targetActor, buildId);
      }
    },
  }).render(true);
}

function isPathbuilderId(str) {
  if (str.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const c = str.charAt(i);
    if (c < '0' || c > '9') return false;
  }
  return true;
}

Hooks.on("init", () => {
  libWrapper.register('pathbuilder2e-import', 'ActorDirectory.prototype._getEntryContextOptions', function (wrapped, ...args) {
    const pathbuilderOption = {
      name: game.i18n.localize('PathbuilderImport.ImportFromPathbuilder'),
      icon: '<i class="fas fa-file-import"></i>',
      condition: li => {
        const doc = ActorDirectory.collection.get(li.data('documentId'));
        return doc.isOwner;
      },
      callback: li => {
        const doc = this.constructor.collection.get(li.data('documentId'));
        pathbuilderImportDialog(doc);
      }
    };
    const contextOptions = wrapped(...args);
    contextOptions.push(pathbuilderOption);
    return contextOptions;
  });
  game.modules.get("pathbuilder2e-import").api = {
    pathbuilderImportDialog: pathbuilderImportDialog
  };
  Hooks.callAll(
    "pathbuilder2eimportReady",
    game.modules.get("pathbuilder2e-import").api
  );
});

Hooks.on("ready", function () {
  log('Initializing');
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
