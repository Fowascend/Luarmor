class Obfuscator {
    static obfuscate(source) {
        let obfuscated = source;
        obfuscated = obfuscated.replace(/--.*$/gm, '');
        obfuscated = obfuscated.replace(/\s+/g, ' ');
        
        const stringPattern = /(["'])(?:(?=(\\?))\2.)*?\1/g;
        let strings = [];
        let stringIndex = 0;
        
        obfuscated = obfuscated.replace(stringPattern, (match) => {
            const content = match.slice(1, -1);
            const encoded = Buffer.from(content).toString('base64');
            const varName = `_S${stringIndex++}`;
            strings.push({ varName, encoded });
            return varName;
        });
        
        let finalScript = `-- Luarmor Protected\n\n`;
        finalScript += `local function _D(s) return (function(t) local n="" for i=1,#t do n=n..string.char(tonumber(t:sub(i,i),36)) end return n end)((function(s) local t="" for i=1,#s,2 do t=t..string.char(tonumber(s:sub(i,i+1),16)) end return t end)(s)) end\n\n`;
        finalScript += `local _S={}\n`;
        for (const s of strings) {
            finalScript += `_S.${s.varName}=_D("${Buffer.from(s.encoded).toString('hex')}")\n`;
        }
        finalScript += `\n${obfuscated}`;
        
        return finalScript;
    }
    
    static generateLoadstring(obfuscatedCode) {
        const encoded = Buffer.from(obfuscatedCode).toString('base64');
        return `loadstring(game:HttpGet("https://raw.githubusercontent.com/luarmor/raw/main/${encoded.substring(0, 30)}"))()`;
    }
}

module.exports = Obfuscator;
