import crypto from 'crypto';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import store from 'snowcat-common/src/store';
import type { WebUiCredentialJson, WebUiCredentialInnerJson } from '@/snowcat-webui-backend/src/types';

// 常量时间字符串比较，避免逐字节短路造成的时序侧信道
function safeEqual (a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class AuthHelper {
  // JWT/HMAC 签名密钥：优先环境变量；未配置时用 crypto 强随机生成并稳定缓存，
  // 不再回落 Math.random()（可预测密钥=凭证可伪造）。
  // 注意：随机密钥在进程重启后失效，所有已签发凭证随之失效，用户需重新登录。
  private static readonly secretKey: string = (() => {
    const envKey = process.env['NAPCAT_WEBUI_JWT_SECRET_KEY'];
    if (envKey && envKey.length >= 16) return envKey;
    return crypto.randomBytes(32).toString('hex');
  })();
  private static readonly MAX_CREDENTIAL_VALID_SECONDS = 3600;

  public static getSecretKey (): string {
    return AuthHelper.secretKey;
  }

  /**
     * 签名凭证方法。
     * @param hash 待签名的凭证字符串。
     * @returns 签名后的凭证对象。
     */
  public static signCredential (hash: string): WebUiCredentialJson {
    const innerJson: WebUiCredentialInnerJson = {
      // 统一使用秒级时间戳，避免与校验逻辑出现单位不一致
      CreatedTime: Math.floor(Date.now() / 1000),
      HashEncoded: hash,
    };
    const jsonString = JSON.stringify(innerJson);
    const hmac = crypto.createHmac('sha256', AuthHelper.secretKey).update(jsonString, 'utf8').digest('hex');
    return { Data: innerJson, Hmac: hmac };
  }

  /**
     * 检查凭证是否被篡改的方法。
     * @param credentialJson 凭证的JSON对象。
     * @returns 布尔值，表示凭证是否有效。
     */
  public static checkCredential (credentialJson: WebUiCredentialJson): boolean {
    try {
      const jsonString = JSON.stringify(credentialJson.Data);
      const calculatedHmac = crypto
        .createHmac('sha256', AuthHelper.secretKey)
        .update(jsonString, 'utf8')
        .digest('hex');
      return safeEqual(calculatedHmac, credentialJson.Hmac);
    } catch (_error) {
      return false;
    }
  }

  /**
     * 验证凭证在1小时内有效且token与原始token相同。
     * @param token 待验证的原始token。
     * @param credentialJson 已签名的凭证JSON对象。
     * @returns 布尔值，表示凭证是否有效且token匹配。
     */
  public static validateCredentialWithinOneHour (token: string, credentialJson: WebUiCredentialJson): boolean {
    // 首先检查凭证是否被篡改
    const isValid = AuthHelper.checkCredential(credentialJson);
    if (!isValid) {
      return false;
    }

    // 检查凭证是否在黑名单中
    if (AuthHelper.isCredentialRevoked(credentialJson)) {
      return false;
    }

    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    const createdTimeSeconds = Math.floor(Number(credentialJson.Data.CreatedTime));
    const timeDifferenceSeconds = currentTimeSeconds - createdTimeSeconds;
    const isWithinOneHour = timeDifferenceSeconds >= 0 && timeDifferenceSeconds <= AuthHelper.MAX_CREDENTIAL_VALID_SECONDS;
    return isWithinOneHour && safeEqual(credentialJson.Data.HashEncoded, AuthHelper.generatePasswordHash(token));
  }

  /**
     * 注销指定的Token凭证
     * @param credentialJson 凭证JSON对象
     * @returns void
     */
  public static revokeCredential (credentialJson: WebUiCredentialJson): void {
    const jsonString = JSON.stringify(credentialJson.Data);
    const hmac = crypto.createHmac('sha256', AuthHelper.secretKey).update(jsonString, 'utf8').digest('hex');

    // 将已注销的凭证添加到黑名单中，有效期1小时
    store.set(`revoked:${hmac}`, true, 3600);
  }

  /**
     * 检查凭证是否已被注销
     * @param credentialJson 凭证JSON对象
     * @returns 布尔值，表示凭证是否已被注销
     */
  public static isCredentialRevoked (credentialJson: WebUiCredentialJson): boolean {
    const jsonString = JSON.stringify(credentialJson.Data);
    const hmac = crypto.createHmac('sha256', AuthHelper.secretKey).update(jsonString, 'utf8').digest('hex');

    return store.exists(`revoked:${hmac}`) > 0;
  }

  /**
     * 生成密码Hash（scrypt，随机盐，N=16384 r=8 p=1）。
     * 存储格式: scrypt$<saltHex>$<hashHex>
     * @param password 密码
     * @returns 生成的Hash值（含盐与参数，可自校验）
     */
  public static generatePasswordHash (password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  /**
     * 对比密码和Hash值。
     * 兼容两种输入：
     *  - 新格式 scrypt$<saltHex>$<hashHex>（逐盐校验，恒定时间比较）
     *  - 旧格式 单轮 SHA-256 hex（历史凭证，仅供校验，不用于生成）
     * @param password 密码
     * @param hash Hash值
     * @returns 布尔值，表示密码是否匹配Hash值
     */
  public static comparePasswordHash (password: string, hash: string): boolean {
    if (hash.startsWith('scrypt$')) {
      const parts = hash.split('$');
      if (parts.length !== 3) return false;
      const salt = Buffer.from(parts[1] ?? '', 'hex');
      const expected = Buffer.from(parts[2] ?? '', 'hex');
      if (salt.length !== 16 || expected.length !== 32) return false;
      const actual = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
      return timingSafeEqual(actual, expected);
    }
    // 兼容历史数据：旧版单轮 SHA-256(password + '.napcat')
    // 老凭证仍可通过校验（不丢功能语义），升级后建议改密码以迁移到 scrypt。
    const legacy = crypto.createHash('sha256').update(password + '.napcat').digest('hex');
    return safeEqual(legacy, hash);
  }
}
