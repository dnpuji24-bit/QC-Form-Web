const hostedUat = import.meta.env.VITE_QC_HOSTED_UAT === 'true'

export const operationalPhotoOrigin = hostedUat
  ? 'https://tcmtqgbpafwciaflgsaa.supabase.co'
  : 'https://mcfwnstdfhhtcbksgrlj.supabase.co'
export const operationalPhotoBucket = hostedUat ? 'qc-photos-uat' : 'qc-photos'
export const photoUploadEndpoint = operationalPhotoOrigin + '/functions/v1/' + (hostedUat ? 'qc-photo-upload-uat' : 'qc-photo-upload')
export const photoSignEndpoint = operationalPhotoOrigin + '/functions/v1/' + (hostedUat ? 'qc-photo-sign-uat' : 'qc-photo-sign-operational')
