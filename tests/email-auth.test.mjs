import {readFileSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const output=ts.transpileModule(readFileSync(new URL('../lib/email-auth.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {authMessage,emailCallback}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
test('confirmation and recovery have distinct allowlisted callback URLs',()=>{
 assert.equal(emailCallback('https://app.example'),'https://app.example/auth/callback');
 assert.equal(emailCallback('https://app.example',true),'https://app.example/auth/callback?next=%2Freset-password');
});
test('auth errors show recovery guidance without leaking raw provider payloads',()=>{
 assert.match(authMessage({code:'email_not_confirmed'}),/Confirm your email/);
 assert.match(authMessage({code:'over_email_send_rate_limit'}),/wait/);
 assert.match(authMessage({code:'email_address_not_authorized'}),/email delivery/);
 assert.match(authMessage({code:'invalid_credentials'}),/email or password/);
 assert.doesNotMatch(authMessage({message:'secret backend detail'}),/secret backend detail/);
});
