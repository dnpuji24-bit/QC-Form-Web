import type {Workbook} from 'exceljs'
export const BKM_NAVY:string
export const BKM_GREY:string
export const BKM_COLUMN_CM:number[]
export type BkmExportValue=string|number|null
export function buildBkmWorkbook(input:{number?:string;company?:string;division?:string;date?:string;operations?:BkmExportValue[][];materials?:BkmExportValue[][];materialColumns?:string[];totals?:BkmExportValue[];exactRowCounts?:boolean}):Workbook
