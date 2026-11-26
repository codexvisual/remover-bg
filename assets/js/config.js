/* ------------------------------------------------------------------
   Configuration
   ------------------------------------------------------------------
   Leave apiEndpoint empty to run fully in the browser (AI model is
   downloaded on demand). Set it to your own server endpoint
   (e.g. "api/remove.php") to process images server-side with a
   remove.bg API key stored safely on the server.
------------------------------------------------------------------- */
window.REMOVEBG_CONFIG = {
  apiEndpoint: '',          // '' | 'api/remove.php' | 'http://localhost:3000/api/remove'
  provider: 'auto',         // 'auto' | 'client' | 'server' | 'fallback'
  clientModel: 'https://esm.sh/@imgly/background-removal',
  fallbackTolerance: 58,    // colour distance used by the built-in quick mode
  maxFileSizeMB: 15,
  aiMaxEdge: 1024,          // downscale before inference (speed vs. detail)
  warmupAI: true            // fetch the model in the background on page load
};
