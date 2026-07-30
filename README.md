# 仲間札

オンラインゲームのグループ募集を、活動時間・遊び方・VC・初心者可否・体験参加などの条件で見比べられる公開募集札です。

募集主は登録なしで札を作り、256-bitの編集URLを自分だけで保管します。応募先はHTTPS URLだけを扱い、ゲーム内ID、メール、電話番号、住所、DM、口コミ、画像は扱いません。募集は7〜90日で期限切れになります。

## 開発

```powershell
npm install
npx wrangler d1 migrations apply nakama-fuda --local
npm run dev
npm run release:check
npm run check
npm test
npm run build
```

## 公開

- サービス: <https://nakama-fuda.yhay81.com>
- 運営: [yhay81](https://github.com/yhay81)
- ライセンス: MIT
