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

function log(message) {
  if (!debug) return;
  console.log('%cPathbuilder Import | ' + message, COLOR_1);
}

async function fetchPathbuilderBuild(buildId) {
  const url = `https://www.pathbuilder2e.com/json.php?id=${buildId}`;
  return fetch(url)
    .then(response => response.json())
    .then(json => json.build);
}

class JsonBuilder {
  constructor(buildJson) {
    this.build = buildJson;
    this.idCounter = 0;
  }

  getFakeId() {
    const str = String(this.idCounter).padStart(16, '0');
    this.idCounter++;
    return str;
  }

  /** Given a Pathbuilder JSON object, construct a foundry-like JSON object. */
  async constructJSON(build) {
    // The final object we'll be sending to `importFromJSON`.
    this.output = {};

    // Easy plaintext properties
    this.output.name = build.name;
    this.output.type = 'character';
    this.output.prototypeToken = { name: build.name };
    this.output.system = {
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
    this.output.system.skills = {};
    for (const [skillName, skillAbbr] of SKILLS) {
      this.output.system.skills[skillAbbr] = {
        rank: build.proficiencies[skillName] / 2
      };
    }
    // Ability modifiers
    this.output.system.abilities = {};
    for (const ability of ABILITY_SCORES) {
      this.output.system.abilities[ability] = { value: build.abilities[ability] };
    }

    this.output.items = [];

    await this.loadABCD('pf2e.ancestries', build.ancestry);
    await this.loadABCD('pf2e.backgrounds', build.background);
    await this.loadABCD('pf2e.classes', build['class']);
    await this.loadABCD('pf2e.heritages', build.heritage);
    if (build.deity)
      await this.loadABCD('pf2e.deities', build.deity);

    for (const [loreName, loreProf] of build.lores) {
      const newLore = {
        type: 'lore',
        name: loreName,
        system: {
          proficient: {
            value: loreProf / 2,
          },
        },
        img: 'systems/pf2e/icons/default-icons/lore.svg',
      };
      this.output.items.push(newLore);
    }

    return this.output;
  }

  /**
   * Function to load the Ancestry, Background, Class, Heritage, or Deity
   * from a compendium and append it to the items list.
   */
  async loadABCD(packName, itemName) {
    const pack = await game.packs.get(packName).getDocuments();
    const itemFromCompendium = pack.find(x => x.name === itemName);
    if (itemFromCompendium) {
      // Create a shallow copy to make sure it's POD
      const item = this.pushItem(itemFromCompendium);
      const subItems = item.system?.items;
      if (subItems) {
        for (const subItemKey of Object.keys(subItems)) {
          const subItem = subItems[subItemKey];
          if (subItem.level <= 1) {
            await this.loadItemFromUuid(subItem.uuid);
          }
        }
      }
    }
  }

  /**
   * Loads an item from a compendium given its uuid.
   * @param uuid The uuid to find the item with,
   *              for example "Compendium.pf2e.classfeatures.a3pSIKkDVTvvNSRO".
   */
  async loadItemFromUuid(uuid) {
    if (!(uuid.startsWith('Compendium.'))) {
      log(`Not sure how to handle uuid: ${uuid}`);
      return;
    }
    // Discard the 'Compendium.' prefix
    const uuidParts = uuid.substr(11).split('.');
    const uuidShort = uuidParts.pop();
    const compendiumName = uuidParts.join('.');
    const itemFromCompendium = await game.packs.get(compendiumName).getDocument(uuidShort);
    if (itemFromCompendium) {
      const item = this.pushItem(itemFromCompendium);
    }
  }

  /**
   * Push a shallow copy of the item to the output.
   * Return the new item.
   */
  pushItem(item) {
    const newItem = Object.assign({}, item);
    newItem._id = this.getFakeId();
    this.output.items.push(newItem);
    return newItem;
  }
}



/** Perform the import using an Actor document and a buildId
 * @param targetActor an Actor document to overwrite
 * @param buildId a six-digit string
 */
export async function importFromPathbuilderId(targetActor, buildId) {
  const build = await fetchPathbuilderBuild(buildId);
  const builder = new JsonBuilder(build);
  const json = await builder.constructJSON(build);
  return targetActor.importFromJSON(JSON.stringify(json));
}

export async function pathbuilderImportDialog(targetActor) {
  let applyChanges = false;
  return new Dialog({
  title: `Pathbuilder Import`,
    content:
      `<div>
        <p><strong>It is strongly advised to import to a blank PC and not overwrite an existing PC.</strong></p>
        <hr>
        <p>Step 1: Export your character from Pathbuilder 2e via "Menu -> Export JSON"</p>
        <p>Step 2: Enter the 6 digit user ID number from the pathbuilder export dialog below</p>
        <p>Please note - items which cannot be matched to the Foundry database will not be imported!</p>
        <p>
          <strong>All inventory items will be removed upon import.</strong>
          The option to turn this off will return in the future.
          If you need to keep items, I recommend creating a new PC,
          importing via Pathbuilder to the new PC,
          then dragging inventory items from old PC to new PC.
        </p>
      <div>
      <div id="divCode">
        Enter your pathbuilder user ID number<br>
        <div id="divOuter">
          <div id="divInner">
            <input id="textBoxBuildID" type="number" maxlength="6" />
          </div>
        </div>
      </div>
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
      </style>`,
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
        importFromPathbuilderId(targetActor, buildId);
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
