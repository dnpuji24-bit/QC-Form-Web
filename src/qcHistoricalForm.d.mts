export type HistoricalForm={note:string;area:string;fillings:{jumlah:string;hasilKerja:string;jenisPupuk:string}[]}
export function historicalFormChanges(formType:'spray'|'fertilizer',before:HistoricalForm,after:HistoricalForm):Record<string,unknown>
