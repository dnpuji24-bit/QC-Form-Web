import type {MasterData} from './types'
import type {OperationalResource} from './masterOperationalResources'
type Resources=Record<'units'|'unitNumbers'|'foremen'|'assistants'|'shifts'|'droppers'|'nozzles'|'waterQualities'|'weatherConditions',OperationalResource[]>
export function buildQcMasterData(resources:Resources,materials:Record<string,unknown>[],paddocks:Record<string,unknown>[],activities:Record<string,unknown>[]):MasterData
