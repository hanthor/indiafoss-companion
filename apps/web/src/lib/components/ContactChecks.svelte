<details class="contact-checks">
  <summary>What do contact checks mean?</summary>
  <p>You can save and export someone in People I met without doing these checks.</p>
  <ul>
    <li>
      <strong>Card signature:</strong> the card matches the included signing key. This does not verify
      the person's name or linked accounts.
    </li>
    <li>
      <strong>Compare badges:</strong> compare the saved badge with the one the person shows on their
      own phone. This checks that you have the same card key.
    </li>
    <li>
      <strong>Matrix profile match:</strong> the account's public profile names the same mesh identity.
      This is a profile claim, not Matrix device verification.
    </li>
  </ul>
  <p>
    Verify Matrix accounts and devices in your Matrix chat app. Comparing badges here does not mark
    an account or device as verified.
  </p>
</details>

<style>
  .contact-checks {
    margin-block: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    align-content: center;
  }
  p,
  li {
    line-height: 1.5;
  }
  li + li {
    margin-top: 0.5rem;
  }
</style>
