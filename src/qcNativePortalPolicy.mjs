export const NATIVE_SESSION_MARKER='firebase-native-session-v1'
export function assertNativePortalConfig(native,operational,firestoreOnly,master,registration){
 if(native&&![operational,firestoreOnly,master,registration].every(Boolean))throw Error('NATIVE_PORTAL_CONFIG_INCOMPLETE')
}
export function assertLegacyApiAllowed(native,token){
 if(native||token===NATIVE_SESSION_MARKER)throw Error('NATIVE_PORTAL_LEGACY_API_BLOCKED')
}
