import * as hi from 'hookedin-lib';
import lookupHookin from '../db/lookup-hookin';

export default async function(url: string) {
  const hookinHash = url.substring('/hookin/'.length);
  return await lookupHookin(hookinHash);
}
