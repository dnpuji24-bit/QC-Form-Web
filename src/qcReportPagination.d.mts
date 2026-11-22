export type ReportPhotoRange = { top: number; bottom: number }
export type ReportPageSlice = { start: number; end: number }
export function paginateReportImage(totalHeight: number, pageHeight: number, keepTogether?: ReportPhotoRange[]): ReportPageSlice[]
