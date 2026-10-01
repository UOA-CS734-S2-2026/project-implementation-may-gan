# Privacy backend integration candidate

## Scope and provenance

This isolated candidate merges the reviewed privacy backend line into main commit `d6704a17403f31c09e78cb2a04d148f33bae8eb3`. The user confirmed that the unpublished privacy migrations have run only on disposable test databases. That permits reorganizing this candidate's unpublished migration lineage.

Integrated sources:

- Legal acceptance backend: `a65314e`
- Account lifecycle review head: `670e64d`
- Self-service export review head: `67297de`

The export source remains open-P1 and is not release approved. This candidate does not include the obsolete `dayli-privacy-account-deletion-requests` branch, dirty client work, unreviewed download work, uploads, purge execution, Trash, provider changes, deployment, or activation.

## Migration decision

Published main migrations `0000` through `0014_link_post_media` remain byte-identical. The published baseline report is:

| File | SHA-256 |
| --- | --- |
| `0014_link_post_media.sql` | `d79e050caf8bfecdff727bfbef360ded9b480b3dba720f4a172184b723813923` |
| `0014_snapshot.json` | `d11817c7aece9770804021eb605d496699068458e1a200a2595159871c6ff1e4` |
| main journal | `211d553472b303839de3d223946c217f865c108df503e680daf510f945e3d9ff` |

Private source tags are appended as candidate `0015` through `0031`, rather than renamed in place. Candidate journal timestamps begin one millisecond after main `0014` and are strictly increasing. They are not future dated.

The first private snapshot retains its source UUID and maps its `prevId` to the actual published main `0014` snapshot UUID, `098255a0-7a86-4b07-a29b-a5812028c71a`. Later private snapshot UUID links retain their deterministic source chain. Every later private snapshot carries main's `post_media.reservation_id`, partial unique index, and restrict foreign key. SQL-only source migrations have no fabricated snapshots.

| Source tag | Source hash | Source when | Candidate tag | Candidate hash | Candidate when |
| --- | --- | ---: | --- | --- | ---: |
| `0014_dusty_ben_parker` | `d1596457fffabc2250be35b617df3de9e3fe54c9e7d3a44e5fa9a3faf7774c7c` | 1790742475518 | `0015_dusty_ben_parker` | `d1596457fffabc2250be35b617df3de9e3fe54c9e7d3a44e5fa9a3faf7774c7c` | 1790802230099 |
| `0015_breezy_molecule_man` | `ffe15dafb15727f18684256e65b270012a6b74dadb6b2fce928e7b1cf1944089` | 1790747436706 | `0016_breezy_molecule_man` | `ffe15dafb15727f18684256e65b270012a6b74dadb6b2fce928e7b1cf1944089` | 1790802230100 |
| `0016_slimy_hulk` | `95e7b3ced45bb94eed1909f4c2c0260fdcaa003ab277a698c14be9f12cdb1eb2` | 1790748640225 | `0017_slimy_hulk` | `95e7b3ced45bb94eed1909f4c2c0260fdcaa003ab277a698c14be9f12cdb1eb2` | 1790802230101 |
| `0017_rainy_the_anarchist` | `87abbac6887a2fa78a0c1037fce09ee73890950af39761f91cd7885f35ecdaa9` | 1790750487091 | `0018_rainy_the_anarchist` | `87abbac6887a2fa78a0c1037fce09ee73890950af39761f91cd7885f35ecdaa9` | 1790802230102 |
| `0018_handy_shard` | `371229d173a7637fdc2f8c8e0b7c6e41719b0c557f934e165d66a0cf15e406fe` | 1790751413721 | `0019_handy_shard` | `371229d173a7637fdc2f8c8e0b7c6e41719b0c557f934e165d66a0cf15e406fe` | 1790802230103 |
| `0019_perfect_nick_fury` | `e4b84ce7454ff2c8de17458c9c71360f76ffaf044a1103a30fb12742e8fdd3c2` | 1790752639119 | `0020_perfect_nick_fury` | `e4b84ce7454ff2c8de17458c9c71360f76ffaf044a1103a30fb12742e8fdd3c2` | 1790802230104 |
| `0020_wide_mentallo` | `a1f5a762dcfea12a4eb5b9b101742fc87800a612753a2af4bb4fed6dedc6eb9d` | 1790763393605 | `0021_wide_mentallo` | `a1f5a762dcfea12a4eb5b9b101742fc87800a612753a2af4bb4fed6dedc6eb9d` | 1790802230105 |
| `0021_legal_registration_boundary` | `298d935a504f06b62506a58bb75eab7c7ee4c35f33bec83986827f6264088a22` | 1790764229000 | `0022_legal_registration_boundary` | `298d935a504f06b62506a58bb75eab7c7ee4c35f33bec83986827f6264088a22` | 1790802230106 |
| `0022_remarkable_shriek` | `309f8e9e9416978c2c4431cc33977e9e170fe288d91e5209163796ee99840b3e` | 1790764945500 | `0023_remarkable_shriek` | `309f8e9e9416978c2c4431cc33977e9e170fe288d91e5209163796ee99840b3e` | 1790802230107 |
| `0023_omniscient_steel_serpent` | `13b9a0003eee435e5b3c0ee6d41fd292d5708b7465e1fe710c30a299ed77974c` | 1790765169164 | `0024_omniscient_steel_serpent` | `13b9a0003eee435e5b3c0ee6d41fd292d5708b7465e1fe710c30a299ed77974c` | 1790802230108 |
| `0024_noisy_the_hand` | `9bda1b3ce98913680e400b0a3f6103293de3552a624bf60b8bc63b6bfb99e1f1` | 1790765337958 | `0025_noisy_the_hand` | `9bda1b3ce98913680e400b0a3f6103293de3552a624bf60b8bc63b6bfb99e1f1` | 1790802230109 |
| `0025_bored_warbound` | `851d820f13722ebbf30d1686003058866f75aaf882db7f84d72d078efb3e0a93` | 1790766387884 | `0026_bored_warbound` | `851d820f13722ebbf30d1686003058866f75aaf882db7f84d72d078efb3e0a93` | 1790802230110 |
| `0026_fat_psylocke` | `717be40bafe816bfdcddbf93c38e5e58d945ceacca3f1a4f26514bccf00d01ed` | 1790768140725 | `0027_fat_psylocke` | `717be40bafe816bfdcddbf93c38e5e58d945ceacca3f1a4f26514bccf00d01ed` | 1790802230111 |
| `0027_legal_publication_locking` | `db8b1ebf9abd041398a928ff71b5d4173ba3105fe218de50439925c180dee0e4` | 1790769000000 | `0028_legal_publication_locking` | `db8b1ebf9abd041398a928ff71b5d4173ba3105fe218de50439925c180dee0e4` | 1790802230112 |
| `0028_data_export_worker_procedures` | `096cb00612127a4822fa7d9ba09533ea1c2122d93860b32aca7ddb99981528c7` | 1790811268425 | `0029_data_export_worker_procedures` | `096cb00612127a4822fa7d9ba09533ea1c2122d93860b32aca7ddb99981528c7` | 1790802230113 |
| `0029_data_export_runtime` | `b9b0d172923fc8842c8149c2824dbfdf2409dc3620b918457effa16054dc1970` | 1790811268426 | `0030_data_export_runtime` | `b9b0d172923fc8842c8149c2824dbfdf2409dc3620b918457effa16054dc1970` | 1790802230114 |
| `0030_data_export_fences` | `a32ee72e63144393390e3e1d303d234d91e07bbe2a5927f41fc31bbcee274093` | 1790811268427 | `0031_data_export_fences` | `a32ee72e63144393390e3e1d303d234d91e07bbe2a5927f41fc31bbcee274093` | 1790802230115 |

`0031` is the final mapped source migration. A separately coordinated future source `0031` maps to candidate `0032`, not this candidate.

## Verification and remaining gates

`db:check` normally compares additive history with `origin/main` and honors an explicit CI pull-request base. It separately compares every published SQL migration and snapshot byte-for-byte with reviewed main SHA `d6704a17403f31c09e78cb2a04d148f33bae8eb3`. The candidate PostgreSQL verifier passes that immutable SHA explicitly for its own additive-history comparison. The journal prefix check remains append-only. The verifier provisions separate disposable databases for relationship, messaging, advisory lock, lifecycle, auth, export, and migration-lineage suites. The migration-lineage suite migrates main through `0014`, inserts a populated main-only row, applies the candidate suffix, verifies re-migration idempotence, and verifies the `post_media` restrict foreign key and partial unique index.

The candidate is a combined backend integration and lineage repair. The lifecycle source was replayed in source order, including relationship target concealment, direct-conversation and friend target guards, pair and user row locking around message writes, and HTTP plus PostgreSQL contention coverage:

| Source commit | Candidate commit |
| --- | --- |
| `9371bf6` | `5aa44fd` |
| `b23e3db` | `a2f26a5` |
| `7fbe5a3` | `b35e197` |
| `7f4f8fe` | `fe36197` |
| `525e4d8` | `529f0f9` |
| `3e2e47b` | `d1874c1` |
| `670e64d` | `38c5e53` |

Messaging public sequences and versions remain bounded by `Number.MAX_SAFE_INTEGER`. Database values are selected as text and validated before conversion, unsafe counter allocation rolls back the enclosing transaction, and unsafe stored rows fail closed rather than being rounded or treated as ordinary idempotency reuse. Valid maximum-value detail, list, ordering, and unread cases remain covered.

The candidate is not a claim that the privacy phase is complete. Open gates remain: export P1 review and release approval, client acceptance work, Trash and purge design and implementation, provider and hosted deployment review, and final legal approval.
