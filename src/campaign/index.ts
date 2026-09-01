// Seven authored campaign maps. Compiled at module load.
import type { GameMap, PlayerLoadout } from '../sim/types';
import type { MapBlueprint } from '../sim/blueprint';
import {
  compileDsl, intermissionLines, referenceLoadout,
  type CampaignDsl,
} from './compileDsl';
import foundry from './maps/01-foundry.json';
import gullet from './maps/02-gullet.json';
import catacombs from './maps/03-catacombs.json';
import pit from './maps/04-pit.json';
import spire from './maps/05-spire.json';
import ward from './maps/06-ward.json';
import sanctum from './maps/07-sanctum.json';

export interface CampaignMap {
  index: number;
  id: string;
  title: string;
  subtitle: string;
  intermission: string[];
  victoryTitle?: string;
  victoryBody?: string;
  incomingGuns: number[];
  incomingLoadout: PlayerLoadout;
  dsl: CampaignDsl;
  blueprint: MapBlueprint;
  map: GameMap;
  warnings: string[];
}

const SOURCES: CampaignDsl[] = [
  foundry, gullet, catacombs, pit, spire, ward, sanctum,
] as CampaignDsl[];

function compileOne(dsl: CampaignDsl, index: number): CampaignMap {
  const { blueprint, map, warnings } = compileDsl(dsl, { seed: `campaign:${dsl.id}` });
  return {
    index,
    id: dsl.id,
    title: dsl.title,
    subtitle: dsl.subtitle ?? '',
    intermission: intermissionLines(dsl),
    victoryTitle: dsl.victoryTitle,
    victoryBody: dsl.victoryBody,
    incomingGuns: dsl.incomingGuns.slice(),
    incomingLoadout: referenceLoadout(dsl),
    dsl,
    blueprint,
    map,
    warnings,
  };
}

export const CAMPAIGN: CampaignMap[] = SOURCES.map((dsl, i) => compileOne(dsl, i + 1));

export function campaignMap(n: number): CampaignMap | undefined {
  return CAMPAIGN[n - 1];
}

export {
  compileDsl, referenceLoadout, snapshotLoadout, campaignEconomy, ECONOMY_FLOOR,
  intermissionLines,
} from './compileDsl';
export type { CampaignDsl } from './compileDsl';
