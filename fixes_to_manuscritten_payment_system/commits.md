# Commit range for this article

- **Base ref**: `origin/main`
- **FIRST (merge-base)**: `08b643fd0971b58d6776554be538269c1fa766cf`
- **LAST (HEAD)**: `7358646f7d32d37412ecd0526fccfe18d9a238d0`

## Log (`08b643fd0971b58d6776554be538269c1fa766cf..7358646f7d32d37412ecd0526fccfe18d9a238d0`)

```
f7aaf97 _first_
e4f36fd Refactor repositories to classes
1a3e1b5 (origin/refactor_repos_into_clases, refactor_repos_into_clases) Fix bug where New sender dialog opener was not shown in Sender View
4d76c35 Merge pull request #50 from javierMorales9/refactor_repos_into_clases
b246820 Updated the company data public api route to return credit data about the company
7143f5b Installed all required dependencies for working with k6
e412463 (origin/replicate_concurrent_card_creation_bug_with_k6, replicate_concurrent_card_creation_bug_with_k6) Created the first test for simulating multiple concurrent requests to api create card endpoint
f4a7b72 Merge pull request #51 from javierMorales9/replicate_concurrent_card_creation_bug_with_k6
9cfcc42 (sratch) added docs for k6 load tests
923471e create some row level locks on the company and campiagn in the automated card creation to avoid race conditions on the assigned and available credits respectively
e388fe9 Fixed linter
55eb717 Created and SKIP_ADDRESS_VALIDATION to avoid calling the google validatior. We run it during performance tests because the random generator sometimes generates addresses that belong to a country and the validator fixes. That changes our expected results and so the performance test fails.
650f1eb created new ci for feature branches
a867b8f (origin/create-ci-pipeline-for-feature-branches, create-ci-pipeline-for-feature-branches) created a build:web-ci that runs without need of env vars
35d40ed (origin/staging, staging) Merge pull request #52 from javierMorales9/create-ci-pipeline-for-feature-branches
c2b8642 Tested that the create and deletion of cards of all types of campaigns doesn't cause credits issues
8f53f3a Created a new dev only endpoint for creating purchases. Will be used for k6 simulations
097fc54 Added docs fro the credits lifecycle
e31e518 Add a k6 test to check if due credits and credit compensation is correctly managed
d9f88f4 Added deletion to the purchase k6 test and added some retry after lock behaviour for different elements to make sure they end up working.
485cbc7 Delete useless files about credit manipulation.
74fed56 Improved docs
e1271b0 Merge branch 'staging' into make_concurrent_card_creation_on_the_api_safe
df893c9 Fix lint
23198f0 Ensure locking happens always in the same order to avoid deadlocks.
bc590fd Make the k6 test autorunable so that we can run it from ci
05bd960 Run the k6 test on ci when the pr is merged to staging
48cdf10 Install k6 to run the test on ci
c312969 Fixed k6 installation
d9e1945 ensure the server process ins closed correctly in the k6 test
ece1b98 Fix the server integration tests where it could not determine the migrations folder path
22cac0c Improved documentation about credits and campaign and cards lifecycle
679485a Add validation in backend so a one time campaign cannot be scheduled if there are not enough credits to charge its cards.
8db6ae8 Run lint, build and test steps in ci in parallel
8e45bc2 add cli to download envelopes fast and without failures
88a6b18 some fixes to the envelopes cli so that it takes all the elements
141a3c0 Added a guard to prevent the creation of new purchase creation in non dev enviornments
00cd026 Improved the endpoints error handling
9ab92b6 Prevent card deletion if the selected ids do not belong to the company
578b481 Fixed bug regarding variable shadowing
51ac60d Moved withLockRetry to the packages/db package and add it to more places that try to modify credits concurrently.
b6502f4 Prevent possible deadlocks but ensurint the locking order when locking all campaigns of a company
d065941 Fixed linter and type issues
98e795f Created two different save modes for the campaign to prevent lost updates between locked updates (that happen when the credits are updated, on new cards basically) and normal updated (like the ones they come from the campaign editor). In those cases, there could be the cause that the normal updates, after the lock is released try to update the campaign credit state that already had. Now we prevent it by making sure the normal update don't touch the credits.
b646372 Prevent normal company updates and credit company updates to collision with each other. All copmany updates should lock the row. So now we avoid touching the credits in normal company updates.
0bb663e Fix install
43a78ef Fix install 2.0
d2d2271 Trying to make linter work in the build
7358646 (HEAD -> make_concurrent_card_creation_on_the_api_safe, origin/make_concurrent_card_creation_on_the_api_safe) Installing drizzle on the root to make sure that turborepo can find it
```

## Detailed log

```
f7aaf97  2026-01-17  Javier Morales de Vera  _first_
e4f36fd  2026-01-17  Javier Morales de Vera  Refactor repositories to classes
1a3e1b5  2026-01-18  Javier Morales de Vera  Fix bug where New sender dialog opener was not shown in Sender View
4d76c35  2026-01-19  Javier Morales de Vera  Merge pull request #50 from javierMorales9/refactor_repos_into_clases
b246820  2026-01-19  Javier Morales de Vera  Updated the company data public api route to return credit data about the company
7143f5b  2026-01-19  Javier Morales de Vera  Installed all required dependencies for working with k6
e412463  2026-01-19  Javier Morales de Vera  Created the first test for simulating multiple concurrent requests to api create card endpoint
f4a7b72  2026-01-19  Javier Morales de Vera  Merge pull request #51 from javierMorales9/replicate_concurrent_card_creation_bug_with_k6
9cfcc42  2026-01-19  Javier Morales de Vera  added docs for k6 load tests
923471e  2026-01-20  Javier Morales de Vera  create some row level locks on the company and campiagn in the automated card creation to avoid race conditions on the assigned and available credits respectively
e388fe9  2026-01-20  Javier Morales de Vera  Fixed linter
55eb717  2026-01-20  Javier Morales de Vera  Created and SKIP_ADDRESS_VALIDATION to avoid calling the google validatior. We run it during performance tests because the random generator sometimes generates addresses that belong to a country and the validator fixes. That changes our expected results and so the performance test fails.
650f1eb  2026-01-20  Javier Morales de Vera  created new ci for feature branches
a867b8f  2026-01-20  Javier Morales de Vera  created a build:web-ci that runs without need of env vars
35d40ed  2026-01-20  Javier Morales de Vera  Merge pull request #52 from javierMorales9/create-ci-pipeline-for-feature-branches
c2b8642  2026-01-20  Javier Morales de Vera  Tested that the create and deletion of cards of all types of campaigns doesn't cause credits issues
8f53f3a  2026-01-21  Javier Morales de Vera  Created a new dev only endpoint for creating purchases. Will be used for k6 simulations
097fc54  2026-01-21  Javier Morales de Vera  Added docs fro the credits lifecycle
e31e518  2026-01-21  Javier Morales de Vera  Add a k6 test to check if due credits and credit compensation is correctly managed
d9f88f4  2026-01-21  Javier Morales de Vera  Added deletion to the purchase k6 test and added some retry after lock behaviour for different elements to make sure they end up working.
485cbc7  2026-01-21  Javier Morales de Vera  Delete useless files about credit manipulation.
74fed56  2026-01-21  Javier Morales de Vera  Improved docs
e1271b0  2026-01-21  Javier Morales de Vera  Merge branch 'staging' into make_concurrent_card_creation_on_the_api_safe
df893c9  2026-01-21  Javier Morales de Vera  Fix lint
23198f0  2026-01-22  Javier Morales de Vera  Ensure locking happens always in the same order to avoid deadlocks.
bc590fd  2026-01-22  Javier Morales de Vera  Make the k6 test autorunable so that we can run it from ci
05bd960  2026-01-22  Javier Morales de Vera  Run the k6 test on ci when the pr is merged to staging
48cdf10  2026-01-22  Javier Morales de Vera  Install k6 to run the test on ci
c312969  2026-01-22  Javier Morales de Vera  Fixed k6 installation
d9e1945  2026-01-22  Javier Morales de Vera  ensure the server process ins closed correctly in the k6 test
ece1b98  2026-01-23  Javier Morales de Vera  Fix the server integration tests where it could not determine the migrations folder path
22cac0c  2026-01-23  Javier Morales de Vera  Improved documentation about credits and campaign and cards lifecycle
679485a  2026-01-23  Javier Morales de Vera  Add validation in backend so a one time campaign cannot be scheduled if there are not enough credits to charge its cards.
8db6ae8  2026-01-25  Javier Morales de Vera  Run lint, build and test steps in ci in parallel
8e45bc2  2026-01-26  Javier Morales de Vera  add cli to download envelopes fast and without failures
88a6b18  2026-01-27  Javier Morales de Vera  some fixes to the envelopes cli so that it takes all the elements
141a3c0  2026-01-29  Javier Morales de Vera  Added a guard to prevent the creation of new purchase creation in non dev enviornments
00cd026  2026-01-29  Javier Morales de Vera  Improved the endpoints error handling
9ab92b6  2026-01-30  Javier Morales de Vera  Prevent card deletion if the selected ids do not belong to the company
578b481  2026-01-30  Javier Morales de Vera  Fixed bug regarding variable shadowing
51ac60d  2026-01-30  Javier Morales de Vera  Moved withLockRetry to the packages/db package and add it to more places that try to modify credits concurrently.
b6502f4  2026-01-30  Javier Morales de Vera  Prevent possible deadlocks but ensurint the locking order when locking all campaigns of a company
d065941  2026-01-30  Javier Morales de Vera  Fixed linter and type issues
98e795f  2026-01-30  Javier Morales de Vera  Created two different save modes for the campaign to prevent lost updates between locked updates (that happen when the credits are updated, on new cards basically) and normal updated (like the ones they come from the campaign editor). In those cases, there could be the cause that the normal updates, after the lock is released try to update the campaign credit state that already had. Now we prevent it by making sure the normal update don't touch the credits.
b646372  2026-01-30  Javier Morales de Vera  Prevent normal company updates and credit company updates to collision with each other. All copmany updates should lock the row. So now we avoid touching the credits in normal company updates.
0bb663e  2026-01-30  Javier Morales de Vera  Fix install
43a78ef  2026-01-30  Javier Morales de Vera  Fix install 2.0
d2d2271  2026-01-30  Javier Morales de Vera  Trying to make linter work in the build
7358646  2026-01-30  Javier Morales de Vera  Installing drizzle on the root to make sure that turborepo can find it```
