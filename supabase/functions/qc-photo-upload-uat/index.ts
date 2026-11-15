import { createHandler } from '../qc-photo-upload/handler.ts'
import { photoUat } from '../_shared/qcPhotoUat.ts'

if (Deno.env.get('SUPABASE_URL') !== photoUat.storageUrl) throw Error('Wrong Supabase project for QC UAT')
Deno.serve(createHandler(undefined, false, true))
