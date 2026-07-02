import { describe, it, expect } from 'vitest';
import { BB, DWELL } from '../events/subjects.js';

describe('BB subjects', () => {
  it('static subjects are stable strings', () => {
    expect(BB.INTENT_DECLARED).toBe('bb.intent.declared');
    expect(BB.LEARNER_PREFERENCES_UPDATED).toBe('bb.learner.preferences.updated');
    expect(BB.BRIDGE_REQUESTED).toBe('bb.bridge.requested');
    expect(BB.BRIDGE_READY).toBe('bb.bridge.ready');
    expect(BB.ASSESSMENT_OUTCOME).toBe('bb.assessment.outcome');
    expect(BB.SYNTHESIS_COMPLETED).toBe('bb.synthesis.completed');
    expect(BB.ATTENTION_SURFACED).toBe('bb.attention.surfaced');
    expect(BB.ATTENTION_OUTCOME).toBe('bb.attention.outcome');
    expect(BB.MOUNTED).toBeUndefined(); // lifecycle subjects live on DWELL, not BB
  });

  it('parameterised subjects include the domain/topic', () => {
    expect(BB.CERT_ACHIEVED('aws-saa')).toBe('bb.cert.aws-saa.achieved');
    expect(BB.LEARNER_BASELINE('aws-sap')).toBe('bb.learner.aws-sap.baseline');
    expect(BB.MASTERY_INITIALIZED('gcp-ace')).toBe('bb.mastery.gcp-ace.initialized');
    expect(BB.MASTERY_UPDATED('gcp-ace')).toBe('bb.mastery.gcp-ace.updated');
    expect(BB.GAPS_INITIAL('aws-sap')).toBe('bb.gaps.aws-sap.initial');
    expect(BB.GAPS_UPDATED('aws-sap')).toBe('bb.gaps.aws-sap.updated');
    expect(BB.GAPS_POST_CERT('aws-sap')).toBe('bb.gaps.aws-sap.post-cert');
    expect(BB.PATH_READY('aws-sap')).toBe('bb.path.aws-sap.ready');
    expect(BB.PATH_UPDATED('aws-sap')).toBe('bb.path.aws-sap.updated');
    expect(BB.ASSESSMENT_DIAGNOSTIC('iam')).toBe('bb.assessment.diagnostic.iam');
    expect(BB.DOMAIN_UPDATED('aws-sap')).toBe('bb.domain.aws-sap.updated');
    expect(BB.DOMAIN_CHANGE_AVAILABLE('aws-sap')).toBe('bb.domain.aws-sap.change-available');
    expect(BB.STALENESS_WATCH_ACTIVE('aws-sap')).toBe('bb.staleness.watch.aws-sap.active');
    expect(BB.ANSWER('kg')).toBe('bb.answer.kg');
    expect(BB.CONTRIBUTION('bridge')).toBe('bb.contribution.bridge');
    expect(BB.NEED('bridge')).toBe('bb.need.bridge');
  });

  it('all bb.* subjects begin with bb.', () => {
    const staticValues = Object.entries(BB)
      .filter(([, v]) => typeof v === 'string')
      .map(([, v]) => v as string);

    for (const subject of staticValues) {
      expect(subject).toMatch(/^bb\./);
    }
  });

  it('parameterised subjects produce bb.* strings', () => {
    const fns = Object.entries(BB)
      .filter(([, v]) => typeof v === 'function')
      .map(([, v]) => v as (arg: string) => string);

    for (const fn of fns) {
      expect(fn('test-domain')).toMatch(/^bb\./);
    }
  });
});

describe('DWELL subjects', () => {
  it('static subjects are stable strings', () => {
    expect(DWELL.BROADCAST_DISCOVERY).toBe('dwell.broadcast.discovery');
    expect(DWELL.MOUNTED).toBe('dwell.mounted');
    expect(DWELL.UNMOUNTED).toBe('dwell.unmounted');
  });

  it('user-addressed subjects include the userId', () => {
    const userId = 'user-bill';
    expect(DWELL.USER_DISCOVERY_RESPONSE(userId)).toBe(`dwell.${userId}.discovery.response`);
    expect(DWELL.USER_DOMAIN_GAP(userId)).toBe(`dwell.${userId}.domain.gap`);
    expect(DWELL.USER_KG_DELIVERED(userId)).toBe(`dwell.${userId}.kg.delivered`);
    expect(DWELL.USER_BRIDGE_RESPONSE(userId)).toBe(`dwell.${userId}.bridge.response`);
    expect(DWELL.USER_ASSESSMENT_DELIVERED(userId)).toBe(`dwell.${userId}.assessment.delivered`);
    expect(DWELL.USER_UPDATE_DELIVERED(userId)).toBe(`dwell.${userId}.update.delivered`);
  });

  it('twin-addressed subjects include the twinId', () => {
    const twinId = 'aws-sa-twin';
    expect(DWELL.TWIN_KG_REQUEST(twinId)).toBe(`dwell.${twinId}.kg.request`);
    expect(DWELL.TWIN_BRIDGE_QUERY(twinId)).toBe(`dwell.${twinId}.bridge.query`);
    expect(DWELL.TWIN_ASSESSMENT_REQUEST(twinId)).toBe(`dwell.${twinId}.assessment.request`);
    expect(DWELL.TWIN_OUTCOME_SIGNAL(twinId)).toBe(`dwell.${twinId}.outcome.signal`);
    expect(DWELL.TWIN_UPDATE_REQUEST(twinId)).toBe(`dwell.${twinId}.update.request`);
    expect(DWELL.DOMAIN_UPDATED(twinId)).toBe(`dwell.domain.${twinId}.updated`);
  });

  it('all dwell.* subjects begin with dwell.', () => {
    const staticValues = Object.entries(DWELL)
      .filter(([, v]) => typeof v === 'string')
      .map(([, v]) => v as string);

    for (const subject of staticValues) {
      expect(subject).toMatch(/^dwell\./);
    }
  });

  it('parameterised subjects produce dwell.* strings', () => {
    const fns = Object.entries(DWELL)
      .filter(([, v]) => typeof v === 'function')
      .map(([, v]) => v as (arg: string) => string);

    for (const fn of fns) {
      expect(fn('test-id')).toMatch(/^dwell\./);
    }
  });
});
