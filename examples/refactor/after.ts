async function loadProfile(userId: string) {
  try {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) throw new Error("Request failed");
    const user = await res.json();

    const team = await fetch(`/api/teams/${user.teamId}`).then((r) => r.json());
    return { user, team };
  } catch (err) {
    console.error(err);
    return null;
  }
}
