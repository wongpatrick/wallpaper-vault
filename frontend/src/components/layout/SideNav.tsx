import { NavLink } from 'react-router-dom';

export default function SideNav() {
    return (
        <nav className='sidebar-nav'>
            <NavLink to="/" className="nav-link">
                Dashboard
            </NavLink>
            <NavLink to="/creators" className="nav-link">
                Creators
            </NavLink>
        </nav>
    )
}