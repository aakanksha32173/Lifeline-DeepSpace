/** /home predates the board; send anyone landing here to the live board. */
import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/board" replace />
}
