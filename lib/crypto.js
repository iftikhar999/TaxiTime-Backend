const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  let encrypted = cipher.update(String(plain), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivHex, dataHex] = String(payload).split(':');
  if (!ivHex || !dataHex) {
    return null;
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
};
