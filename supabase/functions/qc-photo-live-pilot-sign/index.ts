import { createHandler } from '../qc-photo-sign-operational/handler.ts'
Deno.serve(createHandler(undefined,true))
