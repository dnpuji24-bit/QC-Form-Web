import { createHandler } from '../qc-photo-upload/handler.ts'
Deno.serve(createHandler(undefined,true))
