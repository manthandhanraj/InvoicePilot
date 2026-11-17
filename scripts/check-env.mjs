const required=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
if(Number(process.versions.node.split('.')[0])<24){console.error('Install Node.js 24 or later, then run again.');process.exitCode=1;}
else{
 const missing=required.filter(key=>!process.env[key]?.trim()||/YOUR-|PLACEHOLDER/i.test(process.env[key]));
 if(missing.length){console.error('Open .env.local in this project folder and replace the placeholders for: '+missing.join(', '));process.exitCode=1;}
 else console.log('Supabase environment variables are filled. Starting the app.');
}
