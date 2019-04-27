import * as hi from 'hookedin-lib'
import custodianInfo, { ackSecretKey } from '../custodian-info'

const ackCustodianInfo: hi.AcknowledgedCustodianInfo = hi.Acknowledged.acknowledge(custodianInfo, ackSecretKey)

export default function() {
  return ackCustodianInfo.toPOD();
}