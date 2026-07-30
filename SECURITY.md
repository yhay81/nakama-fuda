# Security

脆弱性はGitHubのPrivate vulnerability reportingから報告してください。公開Issueへ認証情報や実在する編集URLを投稿しないでください。

- 能力鍵は256-bit乱数で生成し、平文を保存しない。
- 変更APIは同一Origin、JSON、正確な入力形、サイズ上限を検証する。
- 応募先はHTTPS標準ポートだけを許可し、認証情報、localhost、内部ホスト、IP直指定を拒否する。
- 利用者入力はすべてプレーンテキストとして描画する。
- 厳格なCSPを使い、第三者スクリプトや外部APIを使わない。
