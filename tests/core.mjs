import test from 'node:test';
import assert from 'node:assert/strict';
import { attuneCost, deriveMaxHP, deriveMaxStamina, scalingMultiplier } from '../.test-dist/data/gameData.js';
import { CindersmithingSystem } from '../.test-dist/systems/cindersmithing.js';
import { normalizeSave } from '../.test-dist/systems/saveSystem.js';

test('design formulas remain stable', () => {
  assert.equal(attuneCost(1), 100);
  assert.equal(attuneCost(2), 282);
  assert.equal(deriveMaxHP(10), 500);
  assert.equal(deriveMaxStamina(10), 130);
  assert.equal(scalingMultiplier(10, 'B'), 1.15);
});

test('cindersmithing consumes materials and returns the next weapon level', () => {
  const smith = new CindersmithingSystem();
  smith.addMaterial('ashen_ore', 2);
  const weapon = { weaponId: 'arming_sword', level: 0, emberArtId: null };
  const check = smith.canUpgrade(weapon, 100);
  assert.equal(check.canUpgrade, true);
  const result = smith.upgrade(weapon, 100);
  assert.ok(result);
  assert.equal(result.newState.level, 1);
  assert.equal(result.ashCost, 100);
  assert.equal(smith.getMaterialCount('ashen_ore'), 0);
});

test('cindersmithing rejects upgrades without materials or ash', () => {
  const smith = new CindersmithingSystem();
  const weapon = { weaponId: 'arming_sword', level: 0, emberArtId: null };
  assert.equal(smith.canUpgrade(weapon, 100).canUpgrade, false);
  smith.addMaterial('ashen_ore', 2);
  assert.equal(smith.canUpgrade(weapon, 0).canUpgrade, false);
});

test('save normalization migrates legacy saves with safe v2 defaults', () => {
  const save = normalizeSave({
    saveVersion: 1,
    origin: 'wanderer',
    position: { region: 'ashenCoast', x: 200, y: 300 },
    attributes: { vigor: 10 },
  });
  assert.equal(save.saveVersion, 2);
  assert.deepEqual(save.weaponLevels, {});
  assert.deepEqual(save.materials, {});
  assert.equal(save.position.region, 'ashenCoast');
});