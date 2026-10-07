import {readFileSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const output=ts.transpileModule(readFileSync(new URL('../lib/auth-redirect.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {safeReturnTo,appOrigin}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
test('Email return paths cannot redirect to an external origin or auth loop',()=>{for(const path of ['https://evil.example','//evil.example','/\\evil.example','/auth/callback','/login','/foo/../login',null])assert.equal(safeReturnTo(path),'/');});
test('safe relative navigation is retained',()=>assert.equal(safeReturnTo('/?saved=1#passport'),'/?saved=1#passport'));
test('configured canonical origin takes precedence over request host',()=>{const old=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://app.example/path';try{assert.equal(appOrigin('http://untrusted.example'),'https://app.example');}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;}});
