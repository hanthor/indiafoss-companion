import { describe, expect, it } from 'vitest';
import { CAPABILITIES, RELEASE_SCENARIOS, capabilityDefinition } from './capabilities.js';

describe('capabilities', () => {
  describe('RELEASE_SCENARIOS', () => {
    it('exports an array of release scenario definitions', () => {
      expect(Array.isArray(RELEASE_SCENARIOS)).toBe(true);
      expect(RELEASE_SCENARIOS.length).toBeGreaterThan(0);
    });

    it('contains exactly 12 release scenarios as documented', () => {
      expect(RELEASE_SCENARIOS).toHaveLength(12);
    });

    it('has scenarios with required shape (name and meaning)', () => {
      for (const scenario of RELEASE_SCENARIOS) {
        expect(scenario).toHaveProperty('name');
        expect(scenario).toHaveProperty('meaning');
        expect(typeof scenario.name).toBe('string');
        expect(typeof scenario.meaning).toBe('string');
        expect(scenario.name.length).toBeGreaterThan(0);
        expect(scenario.meaning.length).toBeGreaterThan(0);
      }
    });

    it('scenario names follow the scenario.* namespace pattern', () => {
      for (const scenario of RELEASE_SCENARIOS) {
        expect(scenario.name).toMatch(/^scenario\./);
      }
    });

    it('contains expected scenario names', () => {
      const scenarioNames = RELEASE_SCENARIOS.map((s) => s.name);
      expect(scenarioNames).toContain('scenario.fresh-install');
      expect(scenarioNames).toContain('scenario.upgrade');
      expect(scenarioNames).toContain('scenario.airplane-mode');
      expect(scenarioNames).toContain('scenario.restart');
      expect(scenarioNames).toContain('scenario.key-rotation');
    });
  });

  describe('CAPABILITIES', () => {
    it('exports an array of capability definitions', () => {
      expect(Array.isArray(CAPABILITIES)).toBe(true);
      expect(CAPABILITIES.length).toBeGreaterThan(0);
    });

    it('includes all release scenarios', () => {
      const releaseScenarioNames = new Set(RELEASE_SCENARIOS.map((s) => s.name));
      for (const scenario of RELEASE_SCENARIOS) {
        const found = CAPABILITIES.find((c) => c.name === scenario.name);
        expect(found).toBeDefined();
        expect(found).toEqual(scenario);
      }
    });

    it('includes other required capabilities', () => {
      const capabilityNames = CAPABILITIES.map((c) => c.name);
      expect(capabilityNames).toContain('schedule.offline');
      expect(capabilityNames).toContain('mesh.text');
      expect(capabilityNames).toContain('mesh.media.photo');
      expect(capabilityNames).toContain('chat.outbox.durable');
    });

    it('has all items with required shape (name and meaning)', () => {
      for (const capability of CAPABILITIES) {
        expect(capability).toHaveProperty('name');
        expect(capability).toHaveProperty('meaning');
        expect(typeof capability.name).toBe('string');
        expect(typeof capability.meaning).toBe('string');
        expect(capability.name.length).toBeGreaterThan(0);
        expect(capability.meaning.length).toBeGreaterThan(0);
      }
    });

    it('has unique capability names', () => {
      const names = CAPABILITIES.map((c) => c.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('capabilityDefinition', () => {
    it('returns the definition for a known capability name', () => {
      const def = capabilityDefinition('schedule.offline');
      expect(def).toBeDefined();
      expect(def?.name).toBe('schedule.offline');
      expect(def?.meaning).toBe(
        'The published programme, plan and map are usable with no network.',
      );
    });

    it('returns the definition for release scenario names', () => {
      const def = capabilityDefinition('scenario.fresh-install');
      expect(def).toBeDefined();
      expect(def?.name).toBe('scenario.fresh-install');
      expect(def?.meaning).toBe('A first install opens on the published schedule.');
    });

    it('returns undefined for unknown capability names', () => {
      expect(capabilityDefinition('unknown.capability')).toBeUndefined();
      expect(capabilityDefinition('not.a.capability')).toBeUndefined();
    });

    it('is case-sensitive', () => {
      expect(capabilityDefinition('Schedule.Offline')).toBeUndefined();
      expect(capabilityDefinition('SCHEDULE.OFFLINE')).toBeUndefined();
    });

    it('returns all CAPABILITIES when called with their names', () => {
      for (const capability of CAPABILITIES) {
        const found = capabilityDefinition(capability.name);
        expect(found).toEqual(capability);
      }
    });

    it('returns undefined for empty string', () => {
      expect(capabilityDefinition('')).toBeUndefined();
    });

    it('returns the correct instance (not a copy)', () => {
      const def1 = capabilityDefinition('schedule.offline');
      const def2 = capabilityDefinition('schedule.offline');
      expect(def1).toBe(def2);
    });
  });
});
